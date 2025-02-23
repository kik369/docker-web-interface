import logging
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Callable, Dict

from config import Config
from docker_service import Container, DockerService
from flask import Flask, Response, g, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
from logging_utils import (
    RequestIdFilter,
    get_request_id,
    log_request,
    set_request_id,
    setup_logging,
)
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

        self.socketio = SocketIO(
            self.app,
            cors_allowed_origins="*",
            async_mode="eventlet",
            ping_timeout=20,
            ping_interval=10,
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
            now = datetime.now()
            min_ago = now.replace(second=0, microsecond=0)

            # Clean up old entries (keep only last 2 minutes)
            self.request_counts = {
                ts: count
                for ts, count in self.request_counts.items()
                if now - ts < timedelta(minutes=2)
            }

            # Reset counts for a new minute
            if min_ago not in self.request_counts:
                self.request_counts[min_ago] = 1
            else:
                self.request_counts[min_ago] += 1

            # Check if rate limit is exceeded
            if self.request_counts[min_ago] > self.current_rate_limit:
                logger.warning(
                    f"Rate limit exceeded: {self.request_counts[min_ago]} requests in the last minute (limit: {self.current_rate_limit})"
                )
                return self.error_response(
                    f"Rate limit exceeded. Maximum {self.current_rate_limit} requests per minute allowed.",
                    429,
                )

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

        @self.app.route("/api/settings/rate-limit", methods=["POST"])
        @log_request()
        def update_rate_limit() -> Response:
            try:
                data = request.get_json()
                new_rate_limit = int(data.get("rateLimit", self.current_rate_limit))

                if new_rate_limit < 1:
                    logger.warning(
                        "Invalid rate limit value",
                        extra={
                            "event": "update_rate_limit_error",
                            "value": new_rate_limit,
                            "error": "Rate limit must be greater than 0",
                        },
                    )
                    return self.error_response("Rate limit must be greater than 0", 400)

                old_limit = self.current_rate_limit
                self.current_rate_limit = new_rate_limit
                logger.info(
                    "Rate limit updated",
                    extra={
                        "event": "update_rate_limit_success",
                        "old_value": old_limit,
                        "new_value": new_rate_limit,
                    },
                )
                return self.success_response({"rateLimit": self.current_rate_limit})
            except (TypeError, ValueError) as e:
                logger.error(
                    "Invalid rate limit value",
                    extra={
                        "event": "update_rate_limit_error",
                        "error": str(e),
                    },
                )
                return self.error_response(f"Invalid rate limit value: {str(e)}", 400)
            except Exception as e:
                logger.error(
                    "Failed to update rate limit",
                    extra={
                        "event": "update_rate_limit_error",
                        "error": str(e),
                    },
                )
                return self.error_response(f"Failed to update rate limit: {str(e)}")

        @self.app.route("/api/settings/refresh-interval", methods=["POST"])
        @log_request()
        def update_refresh_interval() -> Response:
            try:
                data = request.get_json()
                new_refresh_interval = int(
                    data.get("refreshInterval", self.current_refresh_interval)
                )

                if new_refresh_interval < 5:
                    logger.warning(
                        "Invalid refresh interval value",
                        extra={
                            "event": "update_refresh_interval_error",
                            "value": new_refresh_interval,
                            "error": "Refresh interval must be at least 5 seconds",
                        },
                    )
                    return self.error_response(
                        "Refresh interval must be at least 5 seconds", 400
                    )

                old_interval = self.current_refresh_interval
                self.current_refresh_interval = new_refresh_interval
                Config.REFRESH_INTERVAL = new_refresh_interval
                logger.info(
                    "Refresh interval updated",
                    extra={
                        "event": "update_refresh_interval_success",
                        "old_value": old_interval,
                        "new_value": new_refresh_interval,
                    },
                )
                return self.success_response(
                    {"refreshInterval": self.current_refresh_interval * 1000}
                )
            except (TypeError, ValueError) as e:
                logger.error(
                    "Invalid refresh interval value",
                    extra={
                        "event": "update_refresh_interval_error",
                        "error": str(e),
                    },
                )
                return self.error_response(
                    f"Invalid refresh interval value: {str(e)}", 400
                )
            except Exception as e:
                logger.error(
                    "Failed to update refresh interval",
                    extra={
                        "event": "update_refresh_interval_error",
                        "error": str(e),
                    },
                )
                return self.error_response(
                    f"Failed to update refresh interval: {str(e)}"
                )

        @self.app.route("/api/settings")
        @log_request()
        def get_settings() -> Response:
            logger.info(
                "Fetching application settings",
                extra={
                    "event": "fetch_settings",
                    "rate_limit": self.current_rate_limit,
                    "refresh_interval": self.current_refresh_interval,
                },
            )
            return self.success_response(
                {
                    "rateLimit": self.current_rate_limit,
                    "refreshInterval": self.current_refresh_interval * 1000,
                }
            )

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
                # Send initial container states to the client in a single batch
                containers, error = self.docker_service.get_all_containers()
                if containers and not error:
                    container_states = [
                        {"container_id": container.id, "state": container.state}
                        for container in containers
                    ]
                    # Send all states in a single event
                    self.socketio.emit(
                        "container_states_batch",
                        {"states": container_states},
                        room=request.sid,
                    )
            except Exception as e:
                logger.error(
                    "Error in WebSocket connect handler",
                    extra={
                        "error": str(e),
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
            except Exception as e:
                logger.error(
                    "Error in WebSocket disconnect handler",
                    extra={
                        "error": str(e),
                        "event": "websocket_disconnect_error",
                        "reason": reason,
                    },
                )

        @self.socketio.on_error()
        def handle_error(e):
            """Handle general Socket.IO errors."""
            logger.error(
                "WebSocket error occurred",
                extra={
                    "error": str(e),
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

                for log_line in self.docker_service.stream_container_logs(container_id):
                    if not self.socketio.server.manager.rooms.get(request.sid, {}).get(
                        "/"
                    ):
                        logger.info(
                            "Client disconnected, stopping log stream",
                            extra={
                                "event": "log_stream_stop",
                                "container_id": container_id,
                                "client": request.remote_addr,
                                "sid": request.sid,
                                "reason": "client_disconnect",
                            },
                        )
                        break
                    self.socketio.emit(
                        "log_update",
                        {"container_id": container_id, "log": log_line},
                        room=request.sid,
                    )
            except Exception as e:
                logger.error(
                    "Error streaming logs",
                    extra={
                        "error": str(e),
                        "event": "log_stream_error",
                        "container_id": container_id,
                        "client": request.remote_addr,
                        "sid": request.sid,
                    },
                )
                self.socketio.emit(
                    "error",
                    {"error": f"Failed to stream logs: {str(e)}"},
                    room=request.sid,
                )

    def run(self) -> None:
        """Run the Flask application with WebSocket support."""
        self.socketio.run(
            self.app,
            host="0.0.0.0",
            port=5000,
            allow_unsafe_werkzeug=True,
            cors_allowed_origins="*",
        )


def create_app() -> Flask:
    """Create and configure the Flask application."""
    flask_app = FlaskApp()
    return flask_app.app


# Create the application instance for Gunicorn
app = create_app()

if __name__ == "__main__":
    flask_app = FlaskApp()
    flask_app.run()
