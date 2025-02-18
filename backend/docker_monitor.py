import logging
from datetime import datetime
from functools import wraps
from typing import Callable

from config import Config
from docker_service import DockerService
from flask import Flask, jsonify, render_template
from flask.wrappers import Response
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
app.config.from_object(Config)

# Configure the app to work with proxy
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# Simple in-memory request counter for rate limiting
request_counts = {}


def rate_limit(f: Callable) -> Callable:
    @wraps(f)
    def decorated_function(*args, **kwargs) -> Response:
        now = datetime.now()
        min_ago = now.replace(second=0, microsecond=0)

        # Reset counts for a new minute
        if min_ago not in request_counts:
            request_counts.clear()
            request_counts[min_ago] = 1
        else:
            request_counts[min_ago] += 1

        if request_counts[min_ago] > Config.MAX_REQUESTS_PER_MINUTE:
            return jsonify({"error": "Rate limit exceeded"}), 429

        return f(*args, **kwargs)

    return decorated_function


@app.route("/")
@rate_limit
def index() -> str:
    output, error = DockerService.get_running_containers()

    if error:
        logger.error(f"Error fetching container data: {error}")
        return render_template("index.html", error=error)

    return render_template(
        "index.html", output=output, refresh_interval=Config.REFRESH_INTERVAL
    )


@app.route("/api/containers")
@rate_limit
def get_containers() -> Response:
    output, error = DockerService.get_running_containers()

    if error:
        return jsonify({"error": error}), 500

    return jsonify({"data": output})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=Config.DEBUG)
