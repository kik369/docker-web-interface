import logging
from datetime import datetime
from functools import wraps
from typing import Any, Callable, Dict

from config import Config
from docker_service import Container, DockerService
from flask import Flask, Response, jsonify
from flask_cors import CORS
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
        self.docker_service = DockerService()
        self.request_counts: Dict[datetime, int] = {}
        self.setup_routes()  # Set up routes during initialization

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

            # Reset counts for a new minute
            if min_ago not in self.request_counts:
                self.request_counts.clear()
                self.request_counts[min_ago] = 1
            else:
                self.request_counts[min_ago] += 1

            if self.request_counts[min_ago] > Config.MAX_REQUESTS_PER_MINUTE:
                return self.error_response("Rate limit exceeded", 429)

            return f(*args, **kwargs)

        return decorated_function

    def error_response(self, message: str, status_code: int = 500) -> Response:
        """Create a standardized error response."""
        return jsonify(
            {
                "error": message,
                "status": "error",
                "timestamp": datetime.utcnow().isoformat(),
            }
        ), status_code

    def success_response(self, data: Any) -> Response:
        """Create a standardized success response."""
        return jsonify(
            {
                "data": data,
                "status": "success",
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

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
            }
            for container in containers
        ]

    def setup_routes(self) -> None:
        """Set up application routes."""

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
            if action not in ["start", "stop", "restart", "rebuild"]:
                return self.error_response(f"Invalid action: {action}", 400)

            action_map = {
                "start": self.docker_service.start_container,
                "stop": self.docker_service.stop_container,
                "restart": self.docker_service.restart_container,
                "rebuild": self.docker_service.rebuild_container,
            }

            success, error = action_map[action](container_id)
            if not success:
                return self.error_response(error or f"Failed to {action} container")

            return self.success_response(
                {"message": f"Container {action}ed successfully"}
            )

        @self.app.errorhandler(Exception)
        def handle_error(error: Exception) -> Response:
            logger.error(f"Unhandled error: {str(error)}", exc_info=True)
            return self.error_response("An unexpected error occurred")

    def run(self) -> None:
        """Run the Flask application."""
        self.app.run(host="0.0.0.0", port=Config.PORT, debug=Config.DEBUG)


def create_app() -> Flask:
    """Create and configure the Flask application."""
    flask_app = FlaskApp()
    return flask_app.app


# Create the application instance for Gunicorn
app = create_app()

if __name__ == "__main__":
    flask_app = FlaskApp()
    flask_app.run()
