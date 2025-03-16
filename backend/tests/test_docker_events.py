import unittest
from unittest.mock import MagicMock, patch

from backend.docker_service import DockerService


class TestDockerEventSubscription(unittest.TestCase):
    @patch("backend.docker_service.docker.from_env")
    def test_emit_container_state(self, mock_docker_from_env):
        # Configure mock
        mock_client = MagicMock()
        mock_docker_from_env.return_value = mock_client

        # Create mock container
        mock_container = MagicMock()
        mock_container.id = "test_container_id"
        mock_container.name = "test_container"
        mock_container.image = "test_image"
        mock_container.status = "running"

        # Configure client to return our mock container
        mock_client.containers.get.return_value = mock_container

        # Create mock SocketIO
        mock_socketio = MagicMock()

        # Create service
        service = DockerService(socketio=mock_socketio)

        # Call _emit_container_state
        service._emit_container_state("test_container_id", "running")

        # Verify socketio.emit was called with the correct data
        mock_socketio.emit.assert_called_once()
        args, kwargs = mock_socketio.emit.call_args

        # Check event name
        self.assertEqual(args[0], "container_state_changed")
