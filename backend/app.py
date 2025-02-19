import logging
from datetime import datetime

from docker_service import DockerService
from flask import Flask, jsonify, request
from flask_cors import CORS
from logging_utils import log_request, setup_logging
from prometheus_client import make_wsgi_app
from werkzeug.middleware.dispatcher import DispatcherMiddleware

app = Flask(__name__)
CORS(app)

# Initialize logging
setup_logging()
logger = logging.getLogger("docker_service")

# Add Prometheus metrics endpoint
app.wsgi_app = DispatcherMiddleware(app.wsgi_app, {"/metrics": make_wsgi_app()})

docker_service = DockerService()


@app.route("/api/containers", methods=["GET"])
@log_request()
def get_containers():
    containers, error = docker_service.get_all_containers()
    if error:
        return jsonify(
            {
                "status": "error",
                "error": error,
                "timestamp": datetime.utcnow().isoformat(),
            }
        ), 500

    return jsonify(
        {
            "status": "success",
            "data": containers,
            "timestamp": datetime.utcnow().isoformat(),
        }
    )


@app.route("/api/containers/<container_id>/logs", methods=["GET"])
@log_request()
def get_container_logs(container_id):
    logs, error = docker_service.get_container_logs(container_id)
    if error:
        return jsonify(
            {
                "status": "error",
                "error": error,
                "timestamp": datetime.utcnow().isoformat(),
            }
        ), 500

    return jsonify(
        {
            "status": "success",
            "data": {"logs": logs},
            "timestamp": datetime.utcnow().isoformat(),
        }
    )


@app.route("/api/containers/<container_id>/<action>", methods=["POST"])
@log_request()
def container_action(container_id, action):
    if action not in ["start", "stop", "restart", "rebuild"]:
        return jsonify(
            {
                "status": "error",
                "error": f"Invalid action: {action}",
                "timestamp": datetime.utcnow().isoformat(),
            }
        ), 400

    action_map = {
        "start": docker_service.start_container,
        "stop": docker_service.stop_container,
        "restart": docker_service.restart_container,
        "rebuild": docker_service.rebuild_container,
    }

    success, error = action_map[action](container_id)
    if not success:
        return jsonify(
            {
                "status": "error",
                "error": error,
                "timestamp": datetime.utcnow().isoformat(),
            }
        ), 500

    return jsonify(
        {
            "status": "success",
            "data": {"message": f"Container {action} successful"},
            "timestamp": datetime.utcnow().isoformat(),
        }
    )


@app.route("/api/logs", methods=["POST"])
@log_request()
def handle_frontend_logs():
    try:
        log_data = request.json
        level = log_data.get("level", "info").upper()
        message = log_data.get("message", "")
        context = log_data.get("context", {})

        log_method = getattr(logger, level.lower(), logger.info)
        log_method(
            f"Frontend: {message}",
            extra={
                "frontend_context": context,
                "frontend_timestamp": log_data.get("timestamp"),
                "frontend_request_id": log_data.get("requestId"),
            },
        )

        return jsonify(
            {
                "status": "success",
                "data": {"message": "Log received"},
                "timestamp": datetime.utcnow().isoformat(),
            }
        )
    except Exception as e:
        logger.exception("Error handling frontend log")
        return jsonify(
            {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            }
        ), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
