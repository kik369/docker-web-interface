import json
from datetime import datetime
from unittest.mock import Mock, patch

import pytest
from docker_monitor import FlaskApp
from docker_service import Container


@pytest.fixture
def mock_docker_service():
    """Create a mock DockerService for testing."""
    mock_service = Mock()

    # Mock container data
    mock_container = Container(
        id="test_container_id",
        name="test_container",
        image="test_image:latest",
        status="running",
        state="running",
        created=datetime(2023, 1, 1),
        ports="8080->80/tcp",
        compose_project="test_project",
        compose_service="test_service",
    )

    # Set up mock returns
    mock_service.get_all_containers.return_value = ([mock_container], None)
    mock_service.get_container_logs.return_value = ("Test container logs", None)
    mock_service.start_container.return_value = (True, None)
    mock_service.stop_container.return_value = (True, None)
    mock_service.restart_container.return_value = (True, None)
    mock_service.rebuild_container.return_value = (True, None)
    mock_service.delete_container.return_value = (True, None)

    # Mock format container data
    mock_service.format_container_data = lambda containers: [
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

    # Mock image data
    mock_image = {
        "id": "sha256:test_image_id",
        "tags": ["test:latest"],
        "size": 10.0,
        "created": "2023-01-01T00:00:00",
        "repo_digests": ["test@sha256:digest"],
        "parent_id": "sha256:parent_id",
        "labels": {"maintainer": "test"},
    }
    mock_service.get_all_images.return_value = ([mock_image], None)
    mock_service.format_image_data.return_value = [mock_image]
    mock_service.delete_image.return_value = (True, None)
    mock_service.get_image_history.return_value = (
        [{"created": "2023-01-01T00:00:00", "created_by": "test", "size": 10.0}],
        None,
    )

    # Mock the _emit_container_state method
    mock_service._emit_container_state = Mock()
    mock_service.start_event_subscription = Mock()
    mock_service.stop_event_subscription = Mock()

    return mock_service


@pytest.fixture
def flask_app(mock_docker_service):
    """Create a Flask app with routes for testing."""
    # Patch the SocketIO class to avoid socket operations
    with patch("docker_monitor.SocketIO") as mock_socketio_class:
        mock_socketio = Mock()
        mock_socketio_class.return_value = mock_socketio

        # Patch other dependencies
        with (
            patch("docker_monitor.DockerService", return_value=mock_docker_service),
            patch("docker_monitor.logging.getLogger"),
            patch("docker_monitor.set_request_id", return_value="test-request-id"),
            patch("docker_monitor.RequestIdFilter"),
        ):
            # Create FlaskApp instance
            app_instance = FlaskApp()
            app_instance.docker_service = mock_docker_service

            # Get the Flask app
            app = app_instance.app
            app.config["TESTING"] = True

            # Store the mock for testing
            app.mock_docker_service = mock_docker_service

            yield app


@pytest.fixture
def client(flask_app):
    """Create a test client for the Flask app."""
    return flask_app.test_client()


class TestDockerMonitor:
    """Test cases for Docker Monitor Flask application."""

    def test_root_endpoint(self, client):
        """Test the root endpoint."""
        response = client.get("/")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert "Backend is up and running" in data["data"]["message"]

    def test_get_containers(self, client, flask_app):
        """Test the get_containers endpoint."""
        response = client.get("/api/containers")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert len(data["data"]) == 1
        assert data["data"][0]["id"] == "test_container_id"
        flask_app.mock_docker_service.get_all_containers.assert_called_once()

    def test_get_container_logs(self, client, flask_app):
        """Test getting container logs."""
        response = client.get("/api/containers/test_container_id/logs")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert data["data"]["logs"] == "Test container logs"
        flask_app.mock_docker_service.get_container_logs.assert_called_once_with(
            "test_container_id"
        )

    def test_start_container(self, client, flask_app):
        """Test starting a container."""
        response = client.post("/api/containers/test_container_id/start")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert "successfully" in data["data"]["message"].lower()
        flask_app.mock_docker_service.start_container.assert_called_once_with(
            "test_container_id"
        )

    def test_stop_container(self, client, flask_app):
        """Test stopping a container."""
        response = client.post("/api/containers/test_container_id/stop")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert "successfully" in data["data"]["message"].lower()
        flask_app.mock_docker_service.stop_container.assert_called_once_with(
            "test_container_id"
        )

    def test_restart_container(self, client, flask_app):
        """Test restarting a container."""
        response = client.post("/api/containers/test_container_id/restart")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert "successfully" in data["data"]["message"].lower()
        flask_app.mock_docker_service.restart_container.assert_called_once_with(
            "test_container_id"
        )

    def test_delete_container(self, client, flask_app):
        """Test deleting a container."""
        response = client.post("/api/containers/test_container_id/delete")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert "successfully" in data["data"]["message"].lower()
        flask_app.mock_docker_service.delete_container.assert_called_once_with(
            "test_container_id"
        )

    def test_rebuild_container(self, client, flask_app):
        """Test rebuilding a container."""
        response = client.post("/api/containers/test_container_id/rebuild")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert "successfully" in data["data"]["message"].lower()
        flask_app.mock_docker_service.rebuild_container.assert_called_once_with(
            "test_container_id"
        )

    def test_invalid_container_action(self, client):
        """Test an invalid container action."""
        response = client.post("/api/containers/test_container_id/invalid_action")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["status"] == "error"
        assert "Invalid action" in data["error"]

    def test_get_images(self, client, flask_app):
        """Test getting all images."""
        response = client.get("/api/images")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert len(data["data"]) == 1
        assert data["data"][0]["id"] == "sha256:test_image_id"
        flask_app.mock_docker_service.get_all_images.assert_called_once()

    def test_get_image_history(self, client, flask_app):
        """Test getting image history."""
        response = client.get("/api/images/test_image_id/history")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert len(data["data"]["history"]) == 1
        flask_app.mock_docker_service.get_image_history.assert_called_once_with(
            "test_image_id"
        )

    def test_delete_image(self, client, flask_app):
        """Test deleting an image."""
        response = client.delete("/api/images/test_image_id")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert "successfully" in data["data"]["message"].lower()
        flask_app.mock_docker_service.delete_image.assert_called_once_with(
            "test_image_id", force=False
        )

    def test_delete_image_with_force(self, client, flask_app):
        """Test deleting an image with force option."""
        response = client.delete("/api/images/test_image_id?force=true")
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data["status"] == "success"
        assert "successfully" in data["data"]["message"].lower()
        flask_app.mock_docker_service.delete_image.assert_called_once_with(
            "test_image_id", force=True
        )

    def test_error_case_containers(self, client, flask_app):
        """Test error handling for container endpoint."""
        flask_app.mock_docker_service.get_all_containers.return_value = (
            None,
            "Test error",
        )
        response = client.get("/api/containers")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["status"] == "error"
        assert "Test error" in data["error"]

    def test_error_case_container_logs(self, client, flask_app):
        """Test error handling for container logs endpoint."""
        flask_app.mock_docker_service.get_container_logs.return_value = (
            None,
            "Test error",
        )
        response = client.get("/api/containers/test_container_id/logs")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["status"] == "error"
        assert "Test error" in data["error"]

    def test_error_case_container_action(self, client, flask_app):
        """Test error handling for container action endpoint."""
        flask_app.mock_docker_service.start_container.return_value = (
            False,
            "Test error",
        )
        response = client.post("/api/containers/test_container_id/start")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["status"] == "error"
        assert "Test error" in data["error"]

    def test_error_case_images(self, client, flask_app):
        """Test error handling for images endpoint."""
        flask_app.mock_docker_service.get_all_images.return_value = (None, "Test error")
        response = client.get("/api/images")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["status"] == "error"
        assert "Test error" in data["error"]

    def test_error_case_delete_image(self, client, flask_app):
        """Test error handling for image deletion endpoint."""
        flask_app.mock_docker_service.delete_image.return_value = (False, "Test error")
        response = client.delete("/api/images/test_image_id")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["status"] == "error"
        assert "Test error" in data["error"]

    def test_error_case_image_history(self, client, flask_app):
        """Test error handling for image history endpoint."""
        flask_app.mock_docker_service.get_image_history.return_value = (
            None,
            "Test error",
        )
        response = client.get("/api/images/test_image_id/history")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["status"] == "error"
        assert "Test error" in data["error"]

    def test_format_container_data(self, flask_app):
        """Test the format_container_data helper method."""
        container = Container(
            id="test_container_id",
            name="test_container",
            image="test_image:latest",
            status="running",
            state="running",
            created=datetime(2023, 1, 1),
            ports="8080->80/tcp",
            compose_project="test_project",
            compose_service="test_service",
        )

        # Create a FlaskApp instance to test its method directly
        app_instance = FlaskApp()
        formatted_data = app_instance.format_container_data([container])

        assert len(formatted_data) == 1
        assert formatted_data[0]["id"] == "test_container_id"
        assert formatted_data[0]["name"] == "test_container"
        assert formatted_data[0]["image"] == "test_image:latest"
        assert formatted_data[0]["compose_project"] == "test_project"
        assert formatted_data[0]["compose_service"] == "test_service"

    def test_error_response(self, flask_app):
        """Test the error response helper function."""
        with flask_app.app_context():
            # Create a FlaskApp instance and directly test its error_response method
            app_instance = FlaskApp()
            response = app_instance.error_response("Test error message", 418)

            assert response.status_code == 418
            data = json.loads(response.get_data(as_text=True))
            assert data["status"] == "error"
            assert data["error"] == "Test error message"

    def test_success_response(self, flask_app):
        """Test the success response helper function."""
        with flask_app.app_context():
            # Create a FlaskApp instance and directly test its success_response method
            app_instance = FlaskApp()
            response = app_instance.success_response({"test": "data"})

            assert response.status_code == 200
            data = json.loads(response.get_data(as_text=True))
            assert data["status"] == "success"
            assert data["data"] == {"test": "data"}
