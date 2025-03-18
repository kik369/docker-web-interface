import logging
import sys
from datetime import datetime, timedelta, timezone
from functools import wraps

try:
    # For Docker environment
    from config import Config
    from docker_service import Container, DockerService
    from logging_utils import (
        RequestIdFilter,
        get_request_id,
        log_request,
        set_request_id,
        setup_logging,
    )
except ImportError:
    # For local development
    from backend.config import Config
    from backend.docker_service import DockerService
    from backend.logging_utils import (
        log_request,
        set_request_id,
        setup_logging,
    )

import re

import eventlet
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.exceptions import HTTPException

# Configure logging
setup_logging()
logger = logging.getLogger(__name__)


class FlaskApp:
    """Flask application for Docker monitoring."""

    _instance = None
    _routes_registered = False

    def __new__(cls, *args, **kwargs):
        """Ensure only one instance of FlaskApp is created (Singleton pattern)."""
        if cls._instance is None:
            cls._instance = super(FlaskApp, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, socketio=None):
        """Initialize the Flask application."""
        # Only initialize once
        if self._initialized:
            return
        self._initialized = True

        # Create Flask app
        self.app = Flask(__name__)
        self.app.config.from_object(Config)

        # Set up CORS
        CORS(self.app, resources={r"/api/*": {"origins": Config.CORS_ORIGINS}})

        # Set up SocketIO
        if socketio is None:
            self.socketio = SocketIO(
                self.app,
                cors_allowed_origins="*",  # Use wildcard string to allow all origins
                async_mode="eventlet",
            )
            logging.info("Server initialized for eventlet.")
        else:
            self.socketio = socketio

        # Create Docker service
        self.docker_service = DockerService(socketio=self.socketio)
        self.docker_service.start_event_subscription()
        logging.info("Docker events subscription initialized")

        # Set up routes and socket handlers
        self.setup_routes()
        self.setup_socket_handlers()

        # Set up rate limiting
        self.request_counts = {}
        self.last_cleanup = datetime.now(timezone.utc)
        self.current_rate_limit = Config.MAX_REQUESTS_PER_MINUTE

        # Track active log streams
        self.active_streams = {}

    def error_response(self, message, status_code=400):
        """Return an error response."""
        response = jsonify({"status": "error", "error": message})
        response.status_code = status_code
        return response

    def success_response(self, data):
        """Return a success response."""
        return jsonify({"status": "success", "data": data})

    def setup_routes(self):
        """Set up the Flask routes."""
        # Only register routes once
        if self._routes_registered:
            return
        self.__class__._routes_registered = True

        @self.app.route("/", endpoint="index")
        @log_request()
        def index():
            """Root endpoint."""
            return self.success_response(
                {"status": "Docker Web Interface API is running"}
            )

        @self.app.route("/api/containers", endpoint="list_containers")
        @self.rate_limit
        @log_request()
        def list_containers() -> Response:
            """List all containers."""
            containers, error = self.docker_service.get_all_containers()
            if error:
                return self.error_response(error)
            return self.success_response(
                self.docker_service.format_container_data(containers)
            )

        @self.app.route(
            "/api/containers/<container_id>/logs", endpoint="get_container_logs"
        )
        @self.rate_limit
        @log_request()
        def get_container_logs(container_id: str) -> Response:
            """Get logs for a specific container."""
            logs, error = self.docker_service.get_container_logs(container_id)
            if error:
                return self.error_response(error)
            return self.success_response({"logs": logs})

        @self.app.route(
            "/api/containers/<container_id>/cpu-stats",
            endpoint="get_container_cpu_stats",
        )
        @self.rate_limit
        @log_request()
        def get_container_cpu_stats(container_id: str) -> Response:
            """Get CPU stats for a specific container."""
            logger.info(
                "Received request to fetch container CPU stats",
                extra={
                    "event": "fetch_container_cpu_stats",
                    "container_id": container_id,
                },
            )
            stats, error = self.docker_service.get_container_cpu_stats(container_id)

            if error:
                logger.error(
                    "Error fetching container CPU stats",
                    extra={
                        "event": "fetch_container_cpu_stats_error",
                        "container_id": container_id,
                        "error": error,
                    },
                )
                return self.error_response(error)

            logger.info(
                "Successfully fetched container CPU stats",
                extra={
                    "event": "fetch_container_cpu_stats_success",
                    "container_id": container_id,
                },
            )

            # Store CPU stats in SQLite database
            self.db_cursor.execute(
                "INSERT INTO cpu_stats (container_id, cpu_percent, timestamp) VALUES (?, ?, ?)",
                (container_id, stats["cpu_percent"], stats["timestamp"]),
            )
            self.db_connection.commit()

            return self.success_response({"stats": stats})

        @self.app.route(
            "/api/resource-usage-metrics",
            endpoint="get_resource_usage_metrics",
        )
        @self.rate_limit
        @log_request()
        def get_resource_usage_metrics() -> Response:
            """Fetch resource usage metrics from the SQLite database."""
            logger.info(
                "Received request to fetch resource usage metrics",
                extra={
                    "event": "fetch_resource_usage_metrics",
                },
            )
            self.db_cursor.execute("SELECT * FROM cpu_stats")
            rows = self.db_cursor.fetchall()
            metrics = [
                {
                    "id": row[0],
                    "container_id": row[1],
                    "cpu_percent": row[2],
                    "timestamp": row[3],
                }
                for row in rows
            ]

            logger.info(
                "Successfully fetched resource usage metrics",
                extra={
                    "event": "fetch_resource_usage_metrics_success",
                    "metrics_count": len(metrics),
                },
            )
            return self.success_response({"metrics": metrics})

        @self.app.route(
            "/api/containers/<container_id>/<action>",
            methods=["POST"],
            endpoint="container_action",
        )
        @self.rate_limit
        @log_request()
        def container_action(container_id: str, action: str) -> Response:
            logger.info(
                "Received container action request",
                extra={
                    "event": "container_action",
                    "container_id": container_id,
                    "action": action,
                },
            )

            if action not in ["start", "stop", "restart", "rebuild", "delete"]:
                logger.warning(
                    "Invalid container action requested",
                    extra={
                        "event": "container_action_error",
                        "container_id": container_id,
                        "action": action,
                        "error": "Invalid action",
                    },
                )
                return self.error_response(f"Invalid action: {action}", 400)

            action_map = {
                "start": self.docker_service.start_container,
                "stop": self.docker_service.stop_container,
                "restart": self.docker_service.restart_container,
                "rebuild": self.docker_service.rebuild_container,
                "delete": self.docker_service.delete_container,
            }

            success, error = action_map[action](container_id)
            if not success:
                logger.error(
                    f"Failed to {action} container",
                    extra={
                        "event": "container_action_error",
                        "container_id": container_id,
                        "action": action,
                        "error": error,
                    },
                )
                return self.error_response(error or f"Failed to {action} container")

            logger.info(
                f"Successfully {action}ed container",
                extra={
                    "event": "container_action_success",
                    "container_id": container_id,
                    "action": action,
                },
            )
            return self.success_response(
                {"message": f"Container {action}d successfully"}
            )

        # Settings endpoints removed

        @self.app.route("/api/images", endpoint="get_images")
        @self.rate_limit
        @log_request()
        def get_images() -> Response:
            """Get all Docker images."""
            logger.info(
                "Received request to fetch all Docker images",
                extra={
                    "event": "fetch_images",
                    "path": "/api/images",
                },
            )
            images, error = self.docker_service.get_all_images()

            if error:
                logger.error(
                    "Error fetching images",
                    extra={
                        "event": "fetch_images_error",
                        "error": error,
                    },
                )
                return self.error_response(error)

            if images is None:
                logger.error(
                    "No image data returned",
                    extra={
                        "event": "fetch_images_error",
                        "error": "Failed to fetch image data",
                    },
                )
                return self.error_response("Failed to fetch image data")

            response_data = self.docker_service.format_image_data(images)
            logger.info(
                "Successfully fetched images",
                extra={
                    "event": "fetch_images_success",
                    "image_count": len(response_data),
                },
            )
            return self.success_response(response_data)

        @self.app.route(
            "/api/images/<image_id>", methods=["DELETE"], endpoint="delete_image"
        )
        @self.rate_limit
        @log_request()
        def delete_image(image_id: str) -> Response:
            """Delete a Docker image."""
            force = request.args.get("force", "false").lower() == "true"
            logger.info(
                "Received request to delete image",
                extra={
                    "event": "delete_image",
                    "image_id": image_id,
                    "force": force,
                },
            )

            success, error = self.docker_service.delete_image(image_id, force=force)
            if not success:
                logger.error(
                    "Failed to delete image",
                    extra={
                        "event": "delete_image_error",
                        "image_id": image_id,
                        "force": force,
                        "error": error,
                    },
                )
                return self.error_response(error or "Failed to delete image")

            logger.info(
                "Successfully deleted image",
                extra={
                    "event": "delete_image_success",
                    "image_id": image_id,
                    "force": force,
                },
            )
            return self.success_response({"message": "Image deleted successfully"})

        @self.app.route(
            "/api/docker/prune/containers",
            methods=["POST"],
            endpoint="prune_containers",
        )
        @self.rate_limit
        @log_request()
        def prune_containers() -> Response:
            """Prune all stopped containers."""
            logger.info(
                "Received request to prune all stopped containers",
                extra={
                    "event": "prune_containers",
                    "path": "/api/docker/prune/containers",
                },
            )

            success, result, error = self.docker_service.prune_containers()

            if not success or error:
                logger.error(
                    "Failed to prune containers",
                    extra={
                        "event": "prune_containers_error",
                        "error": error,
                    },
                )
                return self.error_response(error or "Failed to prune containers")

            logger.info(
                "Successfully pruned containers",
                extra={
                    "event": "prune_containers_success",
                    "containers_deleted": len(result.get("containers_deleted", [])),
                    "space_reclaimed": result.get("space_reclaimed", 0),
                },
            )

            return self.success_response(
                {
                    "message": "Containers pruned successfully",
                    "command": "docker container prune",
                    "result": {
                        "containers_deleted": result.get("containers_deleted", []),
                        "space_reclaimed": result.get("space_reclaimed", 0),
                    },
                }
            )

        @self.app.route(
            "/api/docker/prune/images", methods=["POST"], endpoint="prune_images"
        )
        @self.rate_limit
        @log_request()
        def prune_images() -> Response:
            """Prune all dangling images."""
            logger.info(
                "Received request to prune all dangling images",
                extra={
                    "event": "prune_images",
                    "path": "/api/docker/prune/images",
                },
            )

            success, result, error = self.docker_service.prune_images()

            if not success or error:
                logger.error(
                    "Failed to prune images",
                    extra={
                        "event": "prune_images_error",
                        "error": error,
                    },
                )
                return self.error_response(error or "Failed to prune images")

            logger.info(
                "Successfully pruned images",
                extra={
                    "event": "prune_images_success",
                    "images_deleted": len(result.get("images_deleted", [])),
                    "space_reclaimed": result.get("space_reclaimed", 0),
                },
            )

            return self.success_response(
                {
                    "message": "Images pruned successfully",
                    "command": "docker image prune",
                    "result": {
                        "images_deleted": result.get("images_deleted", []),
                        "space_reclaimed": result.get("space_reclaimed", 0),
                    },
                }
            )

        @self.app.route(
            "/api/docker/prune/volumes", methods=["POST"], endpoint="prune_volumes"
        )
        @self.rate_limit
        @log_request()
        def prune_volumes() -> Response:
            """Prune all unused volumes."""
            logger.info(
                "Received request to prune all unused volumes",
                extra={
                    "event": "prune_volumes",
                    "path": "/api/docker/prune/volumes",
                },
            )

            success, result, error = self.docker_service.prune_volumes()

            if not success or error:
                logger.error(
                    "Failed to prune volumes",
                    extra={
                        "event": "prune_volumes_error",
                        "error": error,
                    },
                )
                return self.error_response(error or "Failed to prune volumes")

            logger.info(
                "Successfully pruned volumes",
                extra={
                    "event": "prune_volumes_success",
                    "volumes_deleted": len(result.get("volumes_deleted", [])),
                    "space_reclaimed": result.get("space_reclaimed", 0),
                },
            )

            return self.success_response(
                {
                    "message": "Volumes pruned successfully",
                    "command": "docker volume prune",
                    "result": {
                        "volumes_deleted": result.get("volumes_deleted", []),
                        "space_reclaimed": result.get("space_reclaimed", 0),
                    },
                }
            )

        @self.app.route(
            "/api/docker/prune/networks", methods=["POST"], endpoint="prune_networks"
        )
        @self.rate_limit
        @log_request()
        def prune_networks() -> Response:
            """Prune all unused networks."""
            logger.info(
                "Received request to prune all unused networks",
                extra={
                    "event": "prune_networks",
                    "path": "/api/docker/prune/networks",
                },
            )

            success, result, error = self.docker_service.prune_networks()

            if not success or error:
                logger.error(
                    "Failed to prune networks",
                    extra={
                        "event": "prune_networks_error",
                        "error": error,
                    },
                )
                return self.error_response(error or "Failed to prune networks")

            logger.info(
                "Successfully pruned networks",
                extra={
                    "event": "prune_networks_success",
                    "networks_deleted": len(result.get("networks_deleted", [])),
                },
            )

            return self.success_response(
                {
                    "message": "Networks pruned successfully",
                    "command": "docker network prune",
                    "result": {
                        "networks_deleted": result.get("networks_deleted", []),
                    },
                }
            )

        @self.app.route("/api/docker/prune/all", methods=["POST"], endpoint="prune_all")
        @self.rate_limit
        @log_request()
        def prune_all() -> Response:
            """Prune all unused Docker resources."""
            logger.info(
                "Received request to prune all unused Docker resources",
                extra={
                    "event": "prune_all",
                    "path": "/api/docker/prune/all",
                },
            )

            success, result, error = self.docker_service.prune_system(all_unused=True)

            if not success or error:
                logger.error(
                    "Failed to prune all Docker resources",
                    extra={
                        "event": "prune_all_error",
                        "error": error,
                    },
                )
                return self.error_response(
                    error or "Failed to prune all Docker resources"
                )

            logger.info(
                "Successfully pruned all Docker resources",
                extra={
                    "event": "prune_all_success",
                    "containers_deleted": len(result.get("containers_deleted", [])),
                    "images_deleted": len(result.get("images_deleted", [])),
                    "networks_deleted": len(result.get("networks_deleted", [])),
                    "volumes_deleted": len(result.get("volumes_deleted", [])),
                    "space_reclaimed": result.get("space_reclaimed", 0),
                },
            )

            return self.success_response(
                {
                    "message": "All unused Docker resources pruned successfully",
                    "command": "docker system prune -a",
                    "result": {
                        "containers_deleted": result.get("containers_deleted", []),
                        "images_deleted": result.get("images_deleted", []),
                        "networks_deleted": result.get("networks_deleted", []),
                        "volumes_deleted": result.get("volumes_deleted", []),
                        "space_reclaimed": result.get("space_reclaimed", 0),
                    },
                }
            )

        @self.app.errorhandler(Exception)
        def handle_error(error: Exception) -> Response:
            """Handle exceptions."""
            if isinstance(error, HTTPException):
                # Log 5xx errors as ERROR, 4xx errors as WARNING, but 404s as DEBUG
                if error.code >= 500:
                    logger.error(
                        f"Server error occurred: {error.description}",
                        extra={
                            "event": "http_error",
                            "error": error.description,
                            "code": error.code,
                            "path": request.path if request else "unknown",
                            "method": request.method if request else "unknown",
                        },
                    )
                elif error.code == 404:
                    # Log 404 errors at DEBUG level since they're very common
                    logger.debug(
                        f"Not found error: {error.description}",
                        extra={
                            "event": "http_not_found",
                            "error": error.description,
                            "code": error.code,
                            "path": request.path if request else "unknown",
                            "method": request.method if request else "unknown",
                        },
                    )
                else:
                    logger.warning(
                        f"Client error occurred: {error.description}",
                        extra={
                            "event": "http_error",
                            "error": error.description,
                            "code": error.code,
                            "path": request.path if request else "unknown",
                            "method": request.method if request else "unknown",
                        },
                    )
                return self.error_response(error.description, status_code=error.code)

            logger.error(
                "Unhandled error occurred",
                extra={
                    "event": "unhandled_error",
                    "error": str(error),
                },
                exc_info=True,
            )
            return self.error_response("An unexpected error occurred")

    def setup_socket_handlers(self):
        """Set up the Socket.IO event handlers."""

        @self.socketio.on("connect")
        def handle_connect():
            try:
                # Generate a unique request ID for WebSocket connections
                request_id = request.headers.get("X-Request-ID") or set_request_id()

                # Log at DEBUG level for routine connections
                logger.debug(
                    "WebSocket client connected",
                    extra={
                        "event": "websocket_connect",
                        "client": request.remote_addr,
                        "sid": request.sid,
                        "request_id": request_id,
                    },
                )

                # Only log at INFO level for non-routine connections (e.g., admin users)
                if request.args.get("admin") == "true":
                    logger.info(
                        "Admin WebSocket client connected",
                        extra={
                            "event": "admin_websocket_connect",
                            "client": request.remote_addr,
                            "sid": request.sid,
                            "request_id": request_id,
                        },
                    )

                # Send connection acknowledgment
                self.socketio.emit(
                    "connection_established",
                    {"message": "WebSocket connection established"},
                    room=request.sid,
                )

                # Get initial container states - this will be the only batch update
                # After this, all updates will be push-based through Docker events
                containers, error = self.docker_service.get_all_containers()
                if containers and not error:
                    # Format detailed container data for initial state
                    container_states = []
                    for container in containers:
                        container_states.append(
                            {
                                "container_id": container.id,
                                "name": container.name,
                                "image": container.image,
                                "status": container.status,
                                "state": container.state,
                                "ports": container.ports,
                                "compose_project": container.compose_project,
                                "compose_service": container.compose_service,
                                "created": container.created.isoformat(),
                            }
                        )

                    # Send initial state in a single event - log at debug level
                    logger.debug(
                        "Sending initial container states",
                        extra={
                            "event": "initial_state_sending",
                            "container_count": len(container_states),
                            "sid": request.sid,
                        },
                    )

                    # Wrap socket.io emit in try-except to handle potential socket errors
                    try:
                        self.socketio.emit(
                            "initial_state",
                            {"containers": container_states},
                            room=request.sid,  # Use room consistently
                        )
                        logger.debug(
                            "Sent initial container states",
                            extra={
                                "event": "initial_state_sent",
                                "container_count": len(container_states),
                                "sid": request.sid,
                            },
                        )
                    except Exception as e:
                        logger.debug(
                            f"Failed to send initial state due to socket error: {str(e)}",
                            extra={
                                "event": "socket_error",
                                "sid": request.sid,
                            },
                        )
                else:
                    error_msg = error or "Failed to get initial container states"
                    logger.error(
                        "Failed to get initial container states",
                        extra={
                            "event": "initial_state_error",
                            "error": error_msg,
                            "sid": request.sid,
                        },
                    )
                    try:
                        self.socketio.emit(
                            "error",
                            {"message": error_msg},
                            room=request.sid,
                        )
                    except Exception as e:
                        logger.debug(
                            f"Failed to send error message due to socket error: {str(e)}",
                            extra={
                                "event": "socket_error",
                                "sid": request.sid,
                            },
                        )

                return True  # Explicitly accept the connection

            except Exception:
                logger.exception(  # Improved logging: logs stack trace
                    "Error in WebSocket connect handler",
                    extra={
                        "event": "websocket_connect_error",
                        "client": request.remote_addr,
                        "sid": request.sid,
                    },
                )
                return False  # Reject the connection on error

        @self.socketio.on("disconnect")
        def handle_disconnect(reason):
            try:
                # Log at DEBUG level for routine disconnections
                logger.debug(
                    "Client disconnected from WebSocket",
                    extra={
                        "event": "websocket_disconnect",
                        "client": request.remote_addr,
                        "sid": request.sid,
                        "reason": reason,
                    },
                )

                # Only log at INFO level for admin disconnections
                if hasattr(request, "args") and request.args.get("admin") == "true":
                    logger.info(
                        "Admin client disconnected from WebSocket",
                        extra={
                            "event": "admin_websocket_disconnect",
                            "client": request.remote_addr,
                            "sid": request.sid,
                            "reason": reason,
                        },
                    )
            except Exception:
                logger.exception(  # Improved logging for disconnect errors
                    "Error in WebSocket disconnect handler",
                    extra={
                        "event": "websocket_disconnect_error",
                        "reason": reason,
                    },
                )

        @self.socketio.on_error()
        def handle_error(e):
            """Handle general Socket.IO errors."""
            logger.exception(  # Captures full error context
                "WebSocket error occurred",
                extra={
                    "event": "websocket_error",
                    "client": getattr(request, "remote_addr", "unknown"),
                    "sid": getattr(request, "sid", "unknown"),
                    "transport": getattr(request, "args", {}).get(
                        "transport", "unknown"
                    ),
                },
            )
            return {"error": "An internal error occurred"}

        @self.socketio.on("start_log_stream")
        def handle_start_log_stream(data):
            """Handle start of log streaming for a container."""
            try:
                if not isinstance(data, dict):
                    logger.warning(
                        "Malformed input for log stream request",
                        extra={
                            "event": "log_stream_error",
                            "error": "Input must be a dictionary",
                            "client": request.remote_addr,
                            "sid": request.sid,
                        },
                    )
                    try:
                        self.socketio.emit(
                            "error",
                            {"error": "Malformed request"},
                            room=request.sid,
                        )
                    except Exception as e:
                        logger.debug(
                            f"Failed to send error message due to socket error: {str(e)}",
                            extra={
                                "event": "socket_error",
                                "sid": request.sid,
                            },
                        )
                    return

                container_id = data.get("container_id")
                if not container_id:
                    logger.warning(
                        "Missing container ID in log stream request",
                        extra={
                            "event": "log_stream_error",
                            "error": "Container ID is required",
                            "client": request.remote_addr,
                            "sid": request.sid,
                        },
                    )
                    try:
                        self.socketio.emit(
                            "error",
                            {"error": "Container ID is required"},
                            room=request.sid,
                        )
                    except Exception as e:
                        logger.debug(
                            f"Failed to send error message due to socket error: {str(e)}",
                            extra={
                                "event": "socket_error",
                                "sid": request.sid,
                            },
                        )
                    return

                logger.info(
                    "Starting log stream",
                    extra={
                        "event": "log_stream_start",
                        "container_id": container_id,
                        "client": request.remote_addr,
                        "sid": request.sid,
                    },
                )

                # Check if there's already an active stream for this container/client
                stream_key = f"{request.sid}_{container_id}"
                if stream_key in self.active_streams:
                    # If there's an existing stream, stop it first
                    logger.info(
                        "Stopping existing log stream before starting a new one",
                        extra={
                            "event": "log_stream_restart",
                            "container_id": container_id,
                            "sid": request.sid,
                        },
                    )
                    self.active_streams[stream_key] = True  # Signal to stop
                    # Give a short delay to allow the existing stream to clean up
                    eventlet.sleep(0.1)

                # Create a new stream key
                self.active_streams[stream_key] = False  # False means don't stop

                # Capture request context values before starting the background task
                sid = request.sid
                remote_addr = request.remote_addr

                def stream_logs_background():
                    """Background task to stream container logs to the client."""
                    # Use captured sid instead of request.sid to avoid "Working outside of request context" error
                    try:
                        # Get initial logs to send to the client
                        initial_logs, error = self.docker_service.get_container_logs(
                            container_id, lines=100
                        )
                        if error:
                            logger.error(
                                "Failed to get initial container logs",
                                extra={
                                    "event": "log_stream_error",
                                    "container_id": container_id,
                                    "error": error,
                                    "sid": sid,
                                },
                            )
                            try:
                                self.socketio.emit(
                                    "error",
                                    {"error": f"Failed to get container logs: {error}"},
                                    room=sid,
                                )
                            except Exception as e:
                                logger.debug(
                                    f"Failed to send error message due to socket error: {str(e)}",
                                    extra={
                                        "event": "socket_error",
                                        "sid": sid,
                                    },
                                )
                            return

                        # Send initial logs to the client
                        if initial_logs:
                            try:
                                logger.debug(
                                    "Sending initial logs to client",
                                    extra={
                                        "event": "log_stream_initial",
                                        "container_id": container_id,
                                        "log_length": len(initial_logs),
                                        "lines": initial_logs.count("\n"),
                                        "sid": sid,
                                    },
                                )
                                self.socketio.emit(
                                    "log_update",
                                    {"container_id": container_id, "log": initial_logs},
                                    room=sid,
                                )
                            except Exception as e:
                                logger.debug(
                                    f"Failed to send initial logs due to socket error: {str(e)}",
                                    extra={
                                        "event": "socket_error",
                                        "sid": sid,
                                    },
                                )
                                return

                        # Extract timestamp from the last log line to avoid duplicate logs
                        last_log_time = None
                        if initial_logs:
                            try:
                                log_lines = initial_logs.strip().split("\n")
                                if log_lines:
                                    last_line = log_lines[-1]
                                    timestamp_match = re.match(
                                        r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})",
                                        last_line,
                                    )
                                    if timestamp_match:
                                        timestamp_str = timestamp_match.group(1)
                                        last_log_time = int(
                                            datetime.strptime(
                                                timestamp_str, "%Y-%m-%dT%H:%M:%S"
                                            ).timestamp()
                                        )
                                        logger.debug(
                                            "Extracted timestamp from last log line",
                                            extra={
                                                "event": "log_stream_timestamp",
                                                "container_id": container_id,
                                                "timestamp": timestamp_str,
                                                "unix_timestamp": last_log_time,
                                                "sid": sid,
                                            },
                                        )
                            except Exception as e:
                                logger.warning(
                                    f"Failed to parse log timestamp: {e}",
                                    extra={
                                        "event": "log_stream_timestamp_error",
                                        "container_id": container_id,
                                        "error": str(e),
                                        "sid": sid,
                                    },
                                )

                        # Start real-time log streaming
                        logger.info(
                            "Starting real-time log stream",
                            extra={
                                "event": "log_stream_realtime_start",
                                "container_id": container_id,
                                "since_timestamp": last_log_time,
                                "sid": sid,
                            },
                        )

                        # Get log generator from Docker service
                        log_generator = self.docker_service.stream_container_logs(
                            container_id, since=last_log_time
                        )

                        if log_generator:
                            log_count = 0
                            for log_line in log_generator:
                                # Check if client disconnected or requested stop
                                if sid not in self.socketio.server.manager.rooms.get(
                                    "/", {}
                                ) or self.active_streams.get(stream_key, True):
                                    logger.info(
                                        "Client disconnected or requested stop, stopping log stream",
                                        extra={
                                            "event": "log_stream_stop",
                                            "container_id": container_id,
                                            "reason": "client_disconnected_or_stopped",
                                            "sid": sid,
                                        },
                                    )
                                    break

                                # Send the log line to the client
                                try:
                                    self.socketio.emit(
                                        "log_update",
                                        {"container_id": container_id, "log": log_line},
                                        room=sid,
                                    )
                                    log_count += 1

                                    # Log every 10 lines in debug mode for troubleshooting
                                    if log_count % 10 == 0:
                                        logger.debug(
                                            f"Streamed {log_count} log lines for container",
                                            extra={
                                                "event": "log_stream_progress",
                                                "container_id": container_id,
                                                "lines_streamed": log_count,
                                                "sid": sid,
                                            },
                                        )
                                except Exception as e:
                                    logger.debug(
                                        f"Failed to send log update due to socket error: {str(e)}",
                                        extra={
                                            "event": "socket_error",
                                            "sid": sid,
                                        },
                                    )
                                    # Break the loop if we can't send to this client anymore
                                    break

                                # Optionally log a summary every 1000 lines
                                if log_count % 1000 == 0:
                                    logger.info(
                                        f"Streamed {log_count} log lines for container {container_id}",
                                        extra={
                                            "event": "log_stream_progress",
                                            "container_id": container_id,
                                            "lines_streamed": log_count,
                                            "sid": sid,
                                        },
                                    )

                            # Log summary at the end of streaming
                            logger.info(
                                f"Completed streaming {log_count} log lines for container {container_id}",
                                extra={
                                    "event": "log_stream_complete",
                                    "container_id": container_id,
                                    "lines_streamed": log_count,
                                    "sid": sid,
                                },
                            )
                        else:
                            logger.warning(
                                "Failed to start log stream",
                                extra={
                                    "event": "log_stream_error",
                                    "container_id": container_id,
                                    "error": "Failed to get container logs",
                                    "sid": sid,
                                },
                            )
                            try:
                                self.socketio.emit(
                                    "error",
                                    {"error": "Failed to get container logs"},
                                    room=sid,
                                )
                            except Exception as e:
                                logger.debug(
                                    f"Failed to send error message due to socket error: {str(e)}",
                                    extra={
                                        "event": "socket_error",
                                        "sid": sid,
                                    },
                                )

                        # Clean up stream key when done
                        if stream_key in self.active_streams:
                            del self.active_streams[stream_key]

                    except Exception as e:
                        logger.error(
                            "Error in log stream background task",
                            extra={
                                "error": str(e),
                                "event": "log_stream_error",
                                "container_id": container_id,
                                "sid": sid,
                            },
                            exc_info=True,
                        )
                        try:
                            self.socketio.emit(
                                "error",
                                {"error": f"Error streaming logs: {str(e)}"},
                                room=sid,
                            )
                        except Exception as socket_err:
                            logger.debug(
                                f"Failed to send error message due to socket error: {str(socket_err)}",
                                extra={
                                    "event": "socket_error",
                                    "sid": sid,
                                },
                            )

                        # Clean up stream key on error
                        if stream_key in self.active_streams:
                            del self.active_streams[stream_key]

                # Start the background task to stream logs
                eventlet.spawn(stream_logs_background)
                return {"status": "stream_started"}

            except Exception as e:
                logger.error(
                    "Error in log stream handler",
                    extra={
                        "error": str(e),
                        "event": "log_stream_error",
                        "container_id": data.get("container_id", "unknown"),
                        "sid": request.sid,
                    },
                    exc_info=True,
                )
                self.socketio.emit(
                    "error",
                    {"error": f"Error streaming logs: {str(e)}"},
                    room=request.sid,
                )
                return {"status": "error", "message": str(e)}

        @self.socketio.on("stop_log_stream")
        def handle_stop_log_stream(data):
            """Handle stop of log streaming for a container."""
            try:
                if not isinstance(data, dict):
                    logger.warning(
                        "Malformed input for stop log stream request",
                        extra={
                            "event": "log_stream_error",
                            "error": "Input must be a dictionary",
                            "client": request.remote_addr,
                            "sid": request.sid,
                        },
                    )
                    return

                container_id = data.get("container_id")
                if not container_id:
                    logger.warning(
                        "Missing container ID in stop log stream request",
                        extra={
                            "event": "log_stream_error",
                            "error": "Container ID is required",
                            "client": request.remote_addr,
                            "sid": request.sid,
                        },
                    )
                    return

                logger.info(
                    "Stopping log stream",
                    extra={
                        "event": "log_stream_stop",
                        "container_id": container_id,
                        "client": request.remote_addr,
                        "sid": request.sid,
                    },
                )

                # Set the stop flag for this stream
                stream_key = f"{request.sid}_{container_id}"
                if stream_key in self.active_streams:
                    self.active_streams[stream_key] = True  # True means stop

                try:
                    self.socketio.emit(
                        "log_stream_stopped",
                        {"container_id": container_id, "message": "Log stream stopped"},
                        room=request.sid,
                    )
                except Exception as e:
                    logger.debug(
                        f"Failed to send log stream stopped message due to socket error: {str(e)}",
                        extra={
                            "event": "socket_error",
                            "sid": request.sid,
                        },
                    )

            except Exception as e:
                logger.error(
                    "Error in stop log stream handler",
                    extra={
                        "error": str(e),
                        "event": "log_stream_error",
                        "sid": request.sid,
                    },
                    exc_info=True,
                )

    def is_rate_limited(self):
        """Check if the current request is rate limited."""
        now = datetime.now(timezone.utc)
        current_minute = now.replace(second=0, microsecond=0)

        # Always clean up old request counts before checking the limit
        self.cleanup_request_counts()
        self.last_cleanup = now

        # Check if rate limit is exceeded
        current_count = self.request_counts.get(current_minute, 0)
        if current_count >= self.current_rate_limit:
            return True

        # Increment request count
        self.request_counts[current_minute] = current_count + 1
        return False

    def cleanup_request_counts(self):
        """Clean up old request counts."""
        now = datetime.now(timezone.utc)
        current_minute = now.replace(second=0, microsecond=0)
        # Two minutes ago
        threshold = current_minute - timedelta(minutes=2)

        # Remove entries older than 2 minutes
        old_keys = [
            minute for minute in self.request_counts.keys() if minute < threshold
        ]
        for minute in old_keys:
            del self.request_counts[minute]

    def run(self) -> None:
        """Run the application."""
        try:
            host = self.app.config.get("HOST", "0.0.0.0")
            port = self.app.config.get("PORT", 5000)
            logger.info(f"Starting server on {host}:{port}")
            self.socketio.run(self.app, host=host, port=port)
        except Exception as e:
            logger.error(f"Error running server: {e}")
            raise
        finally:
            # Stop Docker events subscription when the application stops
            self.docker_service.stop_event_subscription()
            logger.info("Docker events subscription stopped")

    # Add alias for setup_socket_handlers for test compatibility
    setup_websocket_handlers = setup_socket_handlers

    def rate_limit(self, f):
        """Rate limit decorator."""

        @wraps(f)
        def decorated(*args, **kwargs):
            if self.is_rate_limited():
                return self.error_response("Rate limit exceeded", 429)
            return f(*args, **kwargs)

        return decorated


def create_app():
    """Create and configure the Flask application."""
    # Only create the app if it's not being imported for testing
    if not sys.modules.get("pytest"):
        flask_app = FlaskApp()
        return flask_app.app
    return None


# Create the global app instance for Gunicorn to use
app = create_app()

# Only create the app if this module is being run directly
if __name__ == "__main__":
    app = create_app()
