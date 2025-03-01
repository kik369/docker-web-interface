from datetime import datetime
from unittest.mock import Mock, PropertyMock, patch

import docker
import pytest

# Import the module we're testing
from backend.docker_service import DockerService


@pytest.fixture
def mock_docker_client():
    """Create a mock Docker client for testing."""
    mock_client = Mock()

    # Mock containers list
    mock_container = Mock()
    mock_container.id = "test_container_id"
    mock_container.name = "test_container"

    # Mock image with tags
    mock_image = Mock()
    type(mock_image).tags = PropertyMock(return_value=["test_image:latest"])
    mock_container.image = mock_image

    # Mock container attributes
    mock_container.attrs = {
        "State": {
            "Status": "running",
            "Running": True,
            "Paused": False,
            "Restarting": False,
        },
        "Config": {
            "Labels": {
                "com.docker.compose.project": "test_project",
                "com.docker.compose.service": "test_service",
            },
            "Image": "test_image:latest",  # Required for rebuild
            "Env": ["TEST=value"],
        },
        "HostConfig": {
            "PortBindings": {"80/tcp": [{"HostPort": "8080"}]},
            "Binds": ["/host:/container"],
            "NetworkMode": "bridge",
        },
        "Name": "/test_container",
        "Created": "2023-01-01T00:00:00Z",
    }

    # Set up the mock client's containers.list method
    mock_client.containers.list.return_value = [mock_container]

    # Set up the mock client's containers.get method
    mock_client.containers.get.return_value = mock_container

    # Required for the rebuild test
    mock_client.images.pull.return_value = Mock()
    mock_client.containers.run.return_value = mock_container

    return mock_client


@pytest.fixture
def docker_service(mock_docker_client):
    """Create a DockerService instance with a mock client."""
    with patch(
        "backend.docker_service.docker.from_env", return_value=mock_docker_client
    ):
        service = DockerService(socketio=Mock())
        service.client = mock_docker_client
        # Mock the _emit_container_state method to avoid additional API calls
        service._emit_container_state = Mock()
        return service


class TestDockerService:
    """Test cases for the DockerService class."""

    def test_get_all_containers(self, docker_service, mock_docker_client):
        """Test the get_all_containers method returns correctly formatted containers."""
        # Patch the datetime.strptime to avoid format issues
        with patch("backend.docker_service.datetime") as mock_datetime:
            mock_datetime.strptime.return_value = datetime(2023, 1, 1)

            containers, error = docker_service.get_all_containers()

            # Verify we called the Docker API correctly
            mock_docker_client.containers.list.assert_called_once_with(all=True)

            # Verify we got the expected result
            assert error is None
            assert len(containers) == 1

            # Check container properties
            container = containers[0]
            assert container.id == "test_container_id"
            assert container.name == "test_container"
            assert container.image == "test_image:latest"
            assert container.state == "running"
            assert container.compose_project == "Docker Compose: Test Project"
            assert container.compose_service == "test_service"

    def test_get_container_logs(self, docker_service, mock_docker_client):
        """Test the get_container_logs method returns container logs."""
        # Set up the mock container's logs method
        mock_container = mock_docker_client.containers.get.return_value
        mock_container.logs.return_value = b"Test logs"

        logs, error = docker_service.get_container_logs("test_container_id")

        # Verify we called the Docker API correctly
        mock_docker_client.containers.get.assert_called_once_with("test_container_id")
        mock_container.logs.assert_called_once_with(tail=100, timestamps=True)

        # Verify we got the expected result
        assert error is None
        assert logs == "Test logs"

    def test_get_container_logs_not_found(self, docker_service, mock_docker_client):
        """Test handling of container not found errors."""
        # Make the get method raise NotFound
        mock_docker_client.containers.get.side_effect = docker.errors.NotFound(
            "Container not found"
        )

        logs, error = docker_service.get_container_logs("nonexistent_id")

        # Verify error handling
        assert logs is None
        assert "not found" in error

    def test_start_container(self, docker_service, mock_docker_client):
        """Test the start_container method."""
        # Mock the container's start method
        mock_container = mock_docker_client.containers.get.return_value

        success, error = docker_service.start_container("test_container_id")

        # Verify we called the Docker API correctly
        mock_docker_client.containers.get.assert_called_with("test_container_id")
        mock_container.start.assert_called_once()

        # Verify we got the expected result
        assert success is True
        assert error is None

        # Verify WebSocket event was emitted
        docker_service._emit_container_state.assert_called_once_with(
            "test_container_id", "running"
        )

    def test_stop_container(self, docker_service, mock_docker_client):
        """Test the stop_container method."""
        mock_container = mock_docker_client.containers.get.return_value

        success, error = docker_service.stop_container("test_container_id")

        # Verify we called the Docker API correctly
        mock_docker_client.containers.get.assert_called_with("test_container_id")
        mock_container.stop.assert_called_once()

        # Verify we got the expected result
        assert success is True
        assert error is None

        # Verify WebSocket event was emitted
        docker_service._emit_container_state.assert_called_once_with(
            "test_container_id", "stopped"
        )

    def test_restart_container(self, docker_service, mock_docker_client):
        """Test the restart_container method."""
        mock_container = mock_docker_client.containers.get.return_value

        success, error = docker_service.restart_container("test_container_id")

        # Verify we called the Docker API correctly
        mock_docker_client.containers.get.assert_called_with("test_container_id")
        mock_container.restart.assert_called_once()

        # Verify we got the expected result
        assert success is True
        assert error is None

        # Verify WebSocket event was emitted
        docker_service._emit_container_state.assert_called_once_with(
            "test_container_id", "running"
        )

    def test_delete_container(self, docker_service, mock_docker_client):
        """Test the delete_container method."""
        mock_container = mock_docker_client.containers.get.return_value

        success, error = docker_service.delete_container("test_container_id")

        # Verify we called the Docker API correctly
        mock_docker_client.containers.get.assert_called_with("test_container_id")
        mock_container.remove.assert_called_once_with(force=True)

        # Verify we got the expected result
        assert success is True
        assert error is None

        # Verify WebSocket event was emitted
        docker_service._emit_container_state.assert_called_once_with(
            "test_container_id", "deleted"
        )

    def test_format_ports(self, docker_service):
        """Test the _format_ports helper method."""
        container_info = {
            "HostConfig": {
                "PortBindings": {
                    "80/tcp": [{"HostPort": "8080"}],
                    "443/tcp": [{"HostPort": "8443"}],
                }
            }
        }

        ports = docker_service._format_ports(container_info)

        # Check the formatted result
        assert "8080->80/tcp" in ports
        assert "8443->443/tcp" in ports

    def test_extract_compose_info(self, docker_service):
        """Test the _extract_compose_info helper method."""
        # Test labels from a Docker Compose project
        labels_compose = {
            "com.docker.compose.project": "my-project",
            "com.docker.compose.service": "web",
        }

        project, service = docker_service._extract_compose_info(labels_compose)

        assert project == "Docker Compose: My Project"
        assert service == "web"

        # Test standalone container without compose labels
        labels_standalone = {"some.other.label": "value"}

        project, service = docker_service._extract_compose_info(labels_standalone)

        assert project == "Standalone Containers"
        assert service == "unknown"

    def test_error_handling_in_get_all_containers(
        self, docker_service, mock_docker_client
    ):
        """Test error handling in get_all_containers method."""
        # Make the list method raise an exception
        mock_docker_client.containers.list.side_effect = Exception("Test error")

        containers, error = docker_service.get_all_containers()

        # Verify error handling
        assert containers is None
        assert "Failed to get containers" in error
        assert "Test error" in error

    def test_container_action_error_handling(self, docker_service, mock_docker_client):
        """Test error handling in container action methods."""
        # Make the get method raise NotFound
        mock_docker_client.containers.get.side_effect = docker.errors.NotFound(
            "Container not found"
        )

        success, error = docker_service.start_container("nonexistent_id")

        # Verify error handling
        assert success is False
        assert "not found" in error

    def test_get_all_images(self, docker_service, mock_docker_client):
        """Test the get_all_images method."""
        # Set up mock image
        mock_image = Mock()
        mock_image.id = "sha256:test_image_id"
        mock_image.tags = ["test:latest"]
        mock_image.attrs = {
            "Size": 10485760,  # 10MB in bytes
            "Created": "2023-01-01T00:00:00Z",
            "RepoDigests": ["test@sha256:digest"],
            "Parent": "sha256:parent_id",
            "Config": {"Labels": {"maintainer": "test"}},
        }

        mock_docker_client.images.list.return_value = [mock_image]

        # Patch the datetime.strptime to avoid format issues
        with patch("backend.docker_service.datetime") as mock_datetime:
            mock_datetime.strptime.return_value = datetime(2023, 1, 1)
            mock_datetime.fromtimestamp.return_value = datetime(2023, 1, 1)
            mock_datetime.now.return_value = datetime(2023, 1, 1)

            images, error = docker_service.get_all_images()

            # Verify we called the Docker API correctly
            mock_docker_client.images.list.assert_called_once_with(all=True)

            # Verify we got the expected result
            assert error is None
            assert len(images) == 1

            # Check image properties
            image = images[0]
            assert image.id == "sha256:test_image_id"
            assert image.tags == ["test:latest"]
            assert image.size == 10.0  # 10MB
            assert isinstance(image.created, datetime)
            assert image.repo_digests == ["test@sha256:digest"]
            assert image.parent_id == "sha256:parent_id"
            assert image.labels == {"maintainer": "test"}

    def test_delete_image(self, docker_service, mock_docker_client):
        """Test the delete_image method."""
        success, error = docker_service.delete_image("test_image_id")

        # Verify we called the Docker API correctly
        mock_docker_client.images.remove.assert_called_once()

        # Verify we got the expected result
        assert success is True
        assert error is None

    def test_rebuild_container(self, docker_service, mock_docker_client):
        """Test comprehensive rebuild container functionality."""
        # Setup more detailed mocks for the complex rebuild operation
        mock_container = mock_docker_client.containers.get.return_value
        mock_container.attrs = {
            "Config": {
                "Image": "test_image:latest",
                "Env": ["TEST=value"],
                "Labels": {"key": "value"},
            },
            "HostConfig": {
                "PortBindings": {"80/tcp": [{"HostPort": "8080"}]},
                "Binds": ["/host:/container"],
                "NetworkMode": "bridge",
            },
            "Name": "/test_container",
        }

        # Test rebuild operation
        success, error = docker_service.rebuild_container("test_container_id")

        # Verify the correct sequence of operations
        mock_container.stop.assert_called_once()
        mock_container.remove.assert_called_once()
        mock_docker_client.images.pull.assert_called_once_with("test_image:latest")
        mock_docker_client.containers.run.assert_called_once()
        docker_service._emit_container_state.assert_called()

        # Verify success
        assert success is True
        assert error is None

    def test_docker_api_timeout_handling(self, docker_service, mock_docker_client):
        """Test handling of Docker API timeouts."""
        # Configure mock to time out
        import requests

        mock_docker_client.containers.list.side_effect = (
            requests.exceptions.ReadTimeout("Connection timed out")
        )

        # Call method and verify graceful error handling
        containers, error = docker_service.get_all_containers()

        assert containers is None
        assert "timed out" in error.lower()

    def test_image_deletion_with_complex_scenarios(
        self, docker_service, mock_docker_client
    ):
        """Test image deletion with various complex scenarios."""

        # Test case 1: Image with multiple tags
        mock_docker_client.images.remove.side_effect = [
            docker.errors.APIError("image is referenced in multiple repositories")
        ]
        success, error = docker_service.delete_image("test_image_id")
        assert success is False
        assert "multiple repositories" in error

        # Test case 2: Image with child dependencies
        mock_docker_client.images.remove.side_effect = [
            docker.errors.APIError("image has dependent child images")
        ]
        success, error = docker_service.delete_image("test_image_id")
        assert success is False
        assert "dependent child images" in error

        # Test case 3: Image used by running container
        mock_docker_client.images.remove.side_effect = [
            docker.errors.APIError("image is being used by running container")
        ]
        success, error = docker_service.delete_image("test_image_id")
        assert success is False
        assert "running container" in error

        # Reset side effect for next test
        mock_docker_client.images.remove.side_effect = None

    @pytest.mark.parametrize(
        "container_action,expected_method",
        [
            ("start", "start_container"),
            ("stop", "stop_container"),
            ("restart", "restart_container"),
            ("delete", "delete_container"),
            ("rebuild", "rebuild_container"),
        ],
    )
    def test_container_actions_parameterized(
        self, docker_service, mock_docker_client, container_action, expected_method
    ):
        """Test different container actions using parameterization."""
        # Set up the mock container
        mock_container = mock_docker_client.containers.get.return_value

        # Don't try to mock the method, just call it and verify results
        method = getattr(docker_service, expected_method)
        success, error = method("test_container_id")

        # Verify success
        assert success is True
        assert error is None

        # Verify Docker client was called properly
        mock_docker_client.containers.get.assert_called_with("test_container_id")

        # Verify WebSocket event was emitted with correct state
        expected_states = {
            "start_container": "running",
            "stop_container": "stopped",
            "restart_container": "running",
            "delete_container": "deleted",
            "rebuild_container": "running",
        }

        docker_service._emit_container_state.assert_called_with(
            "test_container_id", expected_states[expected_method]
        )
