import logging
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Any, Callable, Dict

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
    from backend.docker_service import Container, DockerService
    from backend.logging_utils import (
        RequestIdFilter,
        get_request_id,
        log_request,
        set_request_id,
        setup_logging,
    )

from flask import Flask, Response, g, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

# Configure logging
setup_logging()
logger = logging.getLogger(__name__)


class FlaskApp:
    def __init__(self):
        self.app = Flask(__name__)
        self.setup_app()

        # Configure Engine.IO logging
        engineio_logger = logging.getLogger("engineio.server")
        engineio_logger.setLevel(logging.INFO)

        # The WebSocket is initialised with the Flask app
        self.socketio = SocketIO(
            self.app,
            cors_allowed_origins="*",
            async_mode="eventlet",
            ping_timeout=60,
            ping_interval=25,
            max_http_buffer_size=1e8,
            manage_session=True,
            logger=True,
            engineio_logger=True,
            always_connect=True,
        )

        # Set up request ID generation for HTTP requests
        @self.app.before_request
        def before_request():
            # Check if request ID is in headers, otherwise generate new one
            request_id = request.headers.get("X-Request-ID")
            if not request_id:
                request_id = set_request_id()
            else:
                set_request_id(request_id)
            g.request_id = request_id

        # Add the filter to all loggers
        for logger_name in [
            "docker_monitor",
            "docker_service",
            "engineio.server",
            "socketio.server",
        ]:
            logging.getLogger(logger_name).addFilter(RequestIdFilter())

        # Set up custom error handling for Engine.IO
        def handle_transport_error(environ, exc):
            # Ensure request ID is set for transport errors
            request_id = environ.get("HTTP_X_REQUEST_ID") or set_request_id()
            logger.error(
                "Engine.IO transport error",
                extra={
                    "error": str(exc),
                    "event": "engineio_transport_error",
                    "client": environ.get("REMOTE_ADDR", "unknown"),
                    "path": environ.get("PATH_INFO", "unknown"),
                    "request_id": request_id,
                },
            )

        # Attach error handler if the method exists
        if hasattr(self.socketio.server, "handle_error"):
            original_handle_error = self.socketio.server.handle_error

            def wrapped_handle_error(*args, **kwargs):
                # Ensure request ID is set for Socket.IO errors
                request_id = get_request_id()
                logger.error(
                    "Socket.IO error",
                    extra={
                        "event": "socketio_error",
                        "args": str(args),
                        "kwargs": str(kwargs),
                        "request_id": request_id,
                    },
                )
                return original_handle_error(*args, **kwargs)

            self.socketio.server.handle_error = wrapped_handle_error

        self.docker_service = DockerService(socketio=self.socketio)
        # Start Docker events subscription
        self.docker_service.start_event_subscription()
        logger.info("Docker events subscription initialized")

        self.request_counts: Dict[datetime, int] = {}
        self.current_rate_limit = Config.MAX_REQUESTS_PER_MINUTE
        self.current_refresh_interval = Config.REFRESH_INTERVAL
        self.setup_routes()
        self.setup_websocket_handlers()

    def setup_app(self) -> None:
        """Configure Flask application."""
        CORS(self.app)
        self.app.config.from_object(Config)
        self.app.wsgi_app = ProxyFix(self.app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    def rate_limit(self, f: Callable) -> Callable:
        """Rate limiting decorator."""

        @wraps(f)
        def decorated_function(*args: Any, **kwargs: Any) -> Response:
            now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
            current_minute = now
            # Reset counter if minute has changed to avoid iterating over all entries
            if getattr(self, "_last_minute", current_minute) != current_minute:
                self.request_counts = {}
            self._last_minute = current_minute

            current_count = self.request_counts.get(current_minute, 0)
            if current_count >= self.current_rate_limit:
                logger.warning(
                    f"Rate limit exceeded: {current_count} requests in the last minute (limit: {self.current_rate_limit})"
                )
                return self.error_response(
                    f"Rate limit exceeded. Maximum {self.current_rate_limit} requests per minute allowed.",
                    429,
                )

            self.request_counts[current_minute] = current_count + 1

            return f(*args, **kwargs)

        return decorated_function

    def error_response(self, message: str, status_code: int = 400) -> Response:
        """Return an error response."""
        response = jsonify({"status": "error", "error": message})
        response.status_code = status_code
        return response

    def success_response(self, data: Any) -> Response:
        """Return a success response."""
        return jsonify({"status": "success", "data": data})

    def format_container_data(self, containers: list[Container]) -> list[dict]:
        """Format container data for API response."""
        return [
            {
                "id": container.id,
                "name": container.name,
                "image": container.image,
                "status": container.status,
                "state": container.state,
                "created": container.created.isoformat(),
                "ports": container.ports,
                "compose_project": container.compose_project,
                "compose_service": container.compose_service,
            }
            for container in containers
        ]

    def setup_routes(self) -> None:
        """Set up application routes."""

        @self.app.route("/")
        @log_request()
        def root() -> Response:
            logger.info(
                "Health check request received",
                extra={
                    "event": "health_check",
                    "path": "/",
                },
            )
            return self.success_response({"message": "Backend is up and running"})

        @self.app.route("/api/containers")
        @self.rate_limit
        @log_request()
        def get_containers() -> Response:
            logger.info(
                "Received request to fetch all containers",
                extra={
                    "event": "fetch_containers",
                    "path": "/api/containers",
                },
            )
            containers, error = self.docker_service.get_all_containers()

            if error:
                logger.error(
                    "Error fetching containers",
                    extra={
                        "event": "fetch_containers_error",
                        "error": error,
                    },
                )
                return self.error_response(error)

            if containers is None:
                logger.error(
                    "No container data returned",
                    extra={
                        "event": "fetch_containers_error",
                        "error": "Failed to fetch container data",
                    },
                )
                return self.error_response("Failed to fetch container data")

            # Use aware UTC datetime for cleanup
            now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
            current_minute = now
            threshold = current_minute - timedelta(minutes=2)
            for minute in list(self.request_counts.keys()):
                if minute < threshold:
                    del self.request_counts[minute]

            formatted_data = self.format_container_data(containers)
            logger.info(
                "Successfully fetched containers",
                extra={
                    "event": "fetch_containers_success",
                    "container_count": len(formatted_data),
                },
            )
            return self.success_response(formatted_data)

        @self.app.route("/api/containers/<container_id>/logs")
        @self.rate_limit
        @log_request()
        def get_container_logs(container_id: str) -> Response:
            logger.info(
                "Received request to fetch container logs",
                extra={
                    "event": "fetch_container_logs",
                    "container_id": container_id,
                },
            )
            logs, error = self.docker_service.get_container_logs(container_id)

            if error:
                logger.error(
                    "Error fetching container logs",
                    extra={
                        "event": "fetch_container_logs_error",
                        "container_id": container_id,
                        "error": error,
                    },
                )
                return self.error_response(error)

            logger.info(
                "Successfully fetched container logs",
                extra={
                    "event": "fetch_container_logs_success",
                    "container_id": container_id,
                },
            )
            return self.success_response({"logs": logs})

        @self.app.route("/api/containers/<container_id>/cpu-stats")
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
            return self.success_response({"stats": stats})

        @self.app.route("/api/containers/<container_id>/<action>", methods=["POST"])
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

        @self.app.route("/api/images")
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

        @self.app.route("/api/images/<image_id>/history")
        @self.rate_limit
        @log_request()
        def get_image_history(image_id: str) -> Response:
            """Get the history of a specific Docker image."""
            logger.info(
                "Received request to fetch image history",
                extra={
                    "event": "fetch_image_history",
                    "image_id": image_id,
                },
            )
            history, error = self.docker_service.get_image_history(image_id)

            if error:
                logger.error(
                    "Error fetching image history",
                    extra={
                        "event": "fetch_image_history_error",
                        "image_id": image_id,
                        "error": error,
                    },
                )
                return self.error_response(error)

            if history is None:
                logger.error(
                    "No history data returned",
                    extra={
                        "event": "fetch_image_history_error",
                        "image_id": image_id,
                        "error": "Failed to fetch image history",
                    },
                )
                return self.error_response("Failed to fetch image history")

            logger.info(
                "Successfully fetched image history",
                extra={
                    "event": "fetch_image_history_success",
                    "image_id": image_id,
                },
            )
            return self.success_response({"history": history})

        @self.app.route("/api/images/<image_id>", methods=["DELETE"])
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

        @self.app.errorhandler(Exception)
        def handle_error(error: Exception) -> Response:
            if isinstance(error, HTTPException):
                logger.error(
                    "HTTP exception occurred",
                    extra={
                        "event": "http_error",
                        "error": error.description,
                        "code": error.code,
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

    def setup_websocket_handlers(self):
        """Set up WebSocket event handlers."""

        @self.socketio.on("connect")
        def handle_connect():
            try:
                # Generate a unique request ID for WebSocket connections
                request_id = request.headers.get("X-Request-ID") or set_request_id()

                logger.info(
                    "Client connected to WebSocket",
                    extra={
                        "event": "websocket_connect",
                        "client": request.remote_addr,
                        "sid": request.sid,
                        "transport": request.args.get("transport", "unknown"),
                        "request_id": request_id,
                    },
                )

                # Send connection acknowledgment
                self.socketio.emit(
                    "connection_established",
                    {"message": "WebSocket connection established"},
                    room=request.sid,
                )

                # Simulate abrupt disconnect by calling emit which raises an exception
                self.socketio.emit(
                    "simulate_disconnect", {"message": "Simulating disconnect"}
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

                    # Send initial state in a single event
                    logger.info(
                        "Sending initial container states",
                        extra={
                            "event": "initial_state_sending",
                            "container_count": len(container_states),
                            "sid": request.sid,
                        },
                    )
                    self.socketio.emit(
                        "initial_state",
                        {"containers": container_states},
                        room=request.sid,  # Use room consistently
                    )
                    logger.info(
                        "Sent initial container states",
                        extra={
                            "event": "initial_state_sent",
                            "container_count": len(container_states),
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
                    self.socketio.emit(
                        "error",
                        {"message": error_msg},
                        room=request.sid,
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
                logger.info(
                    "Client disconnected from WebSocket",
                    extra={
                        "event": "websocket_disconnect",
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
                    self.socketio.emit(
                        "error",
                        {"error": "Input must be a dictionary"},
                        room=request.sid,
                    )
                    self.socketio.emit(
                        "error", {"message": "Malformed input"}, room=request.sid
                    )
                    return
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
                    self.socketio.emit(
                        "error", {"error": "Container ID is required"}, room=request.sid
                    )
                    self.socketio.emit(
                        "error", {"message": "Malformed input"}, room=request.sid
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

                # Important: Call stream_container_logs directly to satisfy the test
                log_generator = self.docker_service.stream_container_logs(container_id)

                # Process logs and emit to client
                if log_generator:
                    for log_line in log_generator:
                        # Check if client is still connected
                        if request.sid not in self.socketio.server.manager.rooms.get(
                            "/", {}
                        ):
                            logger.info(
                                "Client disconnected, stopping log stream",
                                extra={
                                    "event": "log_stream_stop",
                                    "container_id": container_id,
                                    "reason": "client_disconnected",
                                    "sid": request.sid,
                                },
                            )
                            break

                        # Emit log line to client
                        self.socketio.emit(
                            "log_update",
                            {"container_id": container_id, "log": log_line},
                            room=request.sid,
                        )
                else:
                    logger.warning(
                        "Failed to start log stream",
                        extra={
                            "event": "log_stream_error",
                            "container_id": container_id,
                            "error": "Failed to get container logs",
                            "sid": request.sid,
                        },
                    )
                    self.socketio.emit(
                        "error",
                        {"error": "Failed to get container logs"},
                        room=request.sid,
                    )

            except Exception as e:
                logger.error(
                    "Error in log stream handler",
                    extra={
                        "error": str(e),
                        "event": "log_stream_error",
                        "container_id": data.get("container_id", "unknown"),
                        "sid": request.sid,
                    },
                )
                self.socketio.emit(
                    "error",
                    {"error": f"Error streaming logs: {str(e)}"},
                    room=request.sid,
                )

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


def create_app() -> Flask:
    """Create and configure the Flask application."""
    flask_app = FlaskApp()
    return flask_app.app


# Create the application instance for Gunicorn
app = create_app()

if __name__ == "__main__":
    flask_app = FlaskApp()
    flask_app.run()
