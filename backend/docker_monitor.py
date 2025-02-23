import logging
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Callable, Dict

from config import Config
from docker_service import Container, DockerService
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class FlaskApp:
    def __init__(self):
        self.app = Flask(__name__)
        self.setup_app()
        self.socketio = SocketIO(
            self.app,
            cors_allowed_origins="*",
            async_mode="eventlet",
            ping_timeout=20,
            ping_interval=10,
            max_http_buffer_size=1e8,
            manage_session=True,
            logger=False,
            engineio_logger=False,
            always_connect=True,
        )
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
        def root() -> Response:
            return self.success_response({"message": "Backend is up and running"})

        @self.app.route("/api/containers")
        @self.rate_limit
        def get_containers() -> Response:
            containers, error = self.docker_service.get_all_containers()

            if error:
                return self.error_response(error)

            if containers is None:
                return self.error_response("Failed to fetch container data")

            return self.success_response(self.format_container_data(containers))

        @self.app.route("/api/containers/<container_id>/logs")
        @self.rate_limit
        def get_container_logs(container_id: str) -> Response:
            logs, error = self.docker_service.get_container_logs(container_id)

            if error:
                return self.error_response(error)

            return self.success_response({"logs": logs})

        @self.app.route("/api/containers/<container_id>/<action>", methods=["POST"])
        @self.rate_limit
        def container_action(container_id: str, action: str) -> Response:
            if action not in ["start", "stop", "restart", "rebuild", "delete"]:
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
                return self.error_response(error or f"Failed to {action} container")

            return self.success_response(
                {"message": f"Container {action}d successfully"}
            )

        @self.app.route("/api/settings/rate-limit", methods=["POST"])
        def update_rate_limit() -> Response:
            try:
                data = request.get_json()
                new_rate_limit = int(data.get("rateLimit", self.current_rate_limit))

                if new_rate_limit < 1:
                    return self.error_response("Rate limit must be greater than 0", 400)

                self.current_rate_limit = new_rate_limit
                return self.success_response({"rateLimit": self.current_rate_limit})
            except (TypeError, ValueError) as e:
                return self.error_response(f"Invalid rate limit value: {str(e)}", 400)
            except Exception as e:
                return self.error_response(f"Failed to update rate limit: {str(e)}")

        @self.app.route("/api/settings/refresh-interval", methods=["POST"])
        def update_refresh_interval() -> Response:
            try:
                data = request.get_json()
                new_refresh_interval = int(
                    data.get("refreshInterval", self.current_refresh_interval)
                )

                if new_refresh_interval < 5:
                    return self.error_response(
                        "Refresh interval must be at least 5 seconds", 400
                    )

                self.current_refresh_interval = new_refresh_interval
                Config.REFRESH_INTERVAL = new_refresh_interval
                return self.success_response(
                    {"refreshInterval": self.current_refresh_interval * 1000}
                )  # Convert to milliseconds
            except (TypeError, ValueError) as e:
                return self.error_response(
                    f"Invalid refresh interval value: {str(e)}", 400
                )
            except Exception as e:
                return self.error_response(
                    f"Failed to update refresh interval: {str(e)}"
                )

        @self.app.route("/api/settings")
        def get_settings() -> Response:
            return self.success_response(
                {
                    "rateLimit": self.current_rate_limit,
                    "refreshInterval": self.current_refresh_interval
                    * 1000,  # Convert to milliseconds for frontend
                }
            )

        @self.app.route("/api/images")
        @self.rate_limit
        def get_images() -> Response:
            """Get all Docker images."""
            logger.info("Received request to fetch all Docker images")
            images, error = self.docker_service.get_all_images()

            if error:
                logger.error(f"Error fetching images: {error}")
                return self.error_response(error)

            if images is None:
                return self.error_response("Failed to fetch image data")

            response_data = self.docker_service.format_image_data(images)
            logger.info(f"Successfully fetched {len(response_data)} images")
            return self.success_response(response_data)

        @self.app.route("/api/images/<image_id>/history")
        @self.rate_limit
        def get_image_history(image_id: str) -> Response:
            """Get the history of a specific Docker image."""
            logger.info(f"Received request to fetch history for image: {image_id}")
            history, error = self.docker_service.get_image_history(image_id)

            if error:
                logger.error(f"Error fetching image history: {error}")
                return self.error_response(error)

            if history is None:
                return self.error_response("Failed to fetch image history")

            logger.info(f"Successfully fetched history for image: {image_id}")
            return self.success_response({"history": history})

        @self.app.route("/api/images/<image_id>", methods=["DELETE"])
        @self.rate_limit
        def delete_image(image_id: str) -> Response:
            """Delete a Docker image."""
            force = request.args.get("force", "false").lower() == "true"
            logger.info(f"Received request to delete image {image_id} (force={force})")

            success, error = self.docker_service.delete_image(image_id, force=force)
            if not success:
                logger.error(f"Failed to delete image {image_id}: {error}")
                return self.error_response(error or "Failed to delete image")

            logger.info(f"Successfully deleted image: {image_id}")
            return self.success_response({"message": "Image deleted successfully"})

        @self.app.errorhandler(Exception)
        def handle_error(error: Exception) -> Response:
            if isinstance(error, HTTPException):
                return self.error_response(error.description, status_code=error.code)
            logger.error(f"Unhandled error: {str(error)}", exc_info=True)
            return self.error_response("An unexpected error occurred")

    def setup_websocket_handlers(self):
        """Set up WebSocket event handlers."""

        @self.socketio.on("connect")
        def handle_connect():
            try:
                logger.info(f"Client connected to WebSocket from {request.remote_addr}")
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
                logger.error(f"Error in handle_connect: {str(e)}")
                return False  # Reject the connection on error

        @self.socketio.on("disconnect")
        def handle_disconnect(reason):
            try:
                logger.info(
                    f"Client disconnected from WebSocket from {request.remote_addr}, reason: {reason}"
                )
            except Exception as e:
                logger.error(f"Error during WebSocket disconnect: {str(e)}")

        @self.socketio.on_error()
        def handle_error(e):
            logger.error(f"WebSocket error occurred: {str(e)}")
            return {"error": "An internal error occurred"}

        @self.socketio.on("start_log_stream")
        def handle_start_log_stream(data):
            """Handle start of log streaming for a container."""
            try:
                container_id = data.get("container_id")
                if not container_id:
                    self.socketio.emit(
                        "error", {"error": "Container ID is required"}, room=request.sid
                    )
                    return

                for log_line in self.docker_service.stream_container_logs(container_id):
                    if not self.socketio.server.manager.rooms.get(request.sid, {}).get(
                        "/"
                    ):
                        # Client disconnected, stop streaming
                        break
                    self.socketio.emit(
                        "log_update",
                        {"container_id": container_id, "log": log_line},
                        room=request.sid,
                    )
            except Exception as e:
                logger.error(
                    f"Error streaming logs for container {container_id}: {str(e)}"
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
