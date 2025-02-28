import threading
import time
import unittest
from unittest.mock import MagicMock, call, patch


class TestDockerEventSubscription(unittest.TestCase):
    @patch("backend.docker_service.docker.from_env")
    def test_start_stop_event_subscription(self, mock_docker_from_env):
        from backend.docker_service import DockerService

        # Configure mock
        mock_client = MagicMock()
        mock_docker_from_env.return_value = mock_client

        # Create a mock SocketIO instance
        mock_socketio = MagicMock()

        # Create service instance
        service = DockerService(socketio=mock_socketio)

        # Test starting event subscription
        service.start_event_subscription()

        # Verify a thread was started
        self.assertIsNotNone(service._event_thread)
        self.assertTrue(service._event_thread.daemon)
        self.assertTrue(service._event_thread.is_alive())

        # Test stopping event subscription
        service.stop_event_subscription()

        # Verify stop_event was set
        self.assertTrue(service._stop_event.is_set())

        # Wait for thread to terminate
        service._event_thread.join(timeout=1)

        # Verify thread is no longer alive
        self.assertFalse(service._event_thread.is_alive())

    @patch("backend.docker_service.docker.from_env")
    def test_event_handling(self, mock_docker_from_env):
        from backend.docker_service import DockerService

        # Set up mock client with events
        mock_client = MagicMock()
        mock_docker_from_env.return_value = mock_client

        # Mock events generator
        mock_events = [
            {"Type": "container", "Actor": {"ID": "test_id_1"}, "status": "start"},
            {"Type": "container", "Actor": {"ID": "test_id_2"}, "status": "stop"},
            {"Type": "container", "Actor": {"ID": "test_id_3"}, "status": "restart"},
        ]

        # Configure the events method to return our mock events
        mock_client.events.return_value = mock_events

        # Create mock SocketIO
        mock_socketio = MagicMock()

        # Create service
        service = DockerService(socketio=mock_socketio)

        # Mock _emit_container_state to avoid actual API calls
        service._emit_container_state = MagicMock()

        # Call the subscription method directly
        service.subscribe_to_docker_events()

        # Verify _emit_container_state was called for each event
        service._emit_container_state.assert_has_calls(
            [
                call("test_id_1", "running"),
                call("test_id_2", "stopped"),
                call("test_id_3", "running"),
            ]
        )

    @patch("backend.docker_service.docker.from_env")
    def test_map_event_to_state(self, mock_docker_from_env):
        from backend.docker_service import DockerService

        # Configure mock
        mock_client = MagicMock()
        mock_docker_from_env.return_value = mock_client

        # Create service instance
        service = DockerService()

        # Test mapping of different event statuses
        test_cases = [
            ("start", "running"),
            ("die", "stopped"),
            ("stop", "stopped"),
            ("kill", "stopped"),
            ("pause", "paused"),
            ("unpause", "running"),
            ("restart", "running"),
            (
                "unknown_status",
                "unknown_status",
            ),  # Should return the input for unknown statuses
        ]

        for event_status, expected_state in test_cases:
            actual_state = service._map_event_to_state(event_status)
            self.assertEqual(actual_state, expected_state)

    @patch("backend.docker_service.docker.from_env")
    def test_emit_container_state(self, mock_docker_from_env):
        from backend.docker_service import DockerService

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

        # Check container data
        container_data = args[1]
        self.assertEqual(container_data["container_id"], "test_container_id")
        self.assertEqual(container_data["state"], "running")

    @patch("backend.docker_service.docker.from_env")
    def test_event_subscription_exception_handling(self, mock_docker_from_env):
        from backend.docker_service import DockerService

        # Configure mock to raise an exception
        mock_client = MagicMock()
        mock_docker_from_env.return_value = mock_client
        mock_client.events.side_effect = Exception("Test exception")

        # Create service
        service = DockerService()

        # Call the subscription method directly - should not raise an exception
        service.subscribe_to_docker_events()

        # No assertions needed - we're just verifying it doesn't crash

    @patch("backend.docker_service.docker.from_env")
    def test_event_subscription_stop_event(self, mock_docker_from_env):
        from backend.docker_service import DockerService

        # Configure mock with an infinite event stream
        mock_client = MagicMock()
        mock_docker_from_env.return_value = mock_client

        # Create an event generator that yields events until stopped
        def event_generator():
            count = 0
            while True:
                yield {
                    "Type": "container",
                    "Actor": {"ID": f"test_id_{count}"},
                    "status": "start",
                }
                count += 1
                time.sleep(0.1)  # Small delay to avoid tight loop

        mock_client.events.return_value = event_generator()

        # Create service
        service = DockerService()

        # Mock _emit_container_state to avoid actual API calls
        service._emit_container_state = MagicMock()

        # Start subscription in a thread
        thread = threading.Thread(target=service.subscribe_to_docker_events)
        thread.daemon = True
        thread.start()

        # Let it run for a short time
        time.sleep(0.5)

        # Set stop event
        service._stop_event.set()

        # Wait for thread to terminate
        thread.join(timeout=1)

        # Verify thread has stopped
        self.assertFalse(thread.is_alive())

        # Verify _emit_container_state was called at least once
        service._emit_container_state.assert_called()


if __name__ == "__main__":
    unittest.main()
