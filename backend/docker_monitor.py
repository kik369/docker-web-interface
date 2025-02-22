import logging
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Callable, Dict

from config import Config
from docker_service import Container, DockerService
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
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
        self.docker_service = DockerService()
        self.request_counts: Dict[datetime, int] = {}
        self.current_rate_limit = Config.MAX_REQUESTS_PER_MINUTE
        self.current_refresh_interval = Config.REFRESH_INTERVAL
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

        @self.app.errorhandler(Exception)
        def handle_error(error: Exception) -> Response:
            if isinstance(error, HTTPException):
                return self.error_response(error.description, status_code=error.code)
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
