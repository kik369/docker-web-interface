import unittest
from datetime import datetime
from unittest.mock import MagicMock, call, patch


class TestWebSocketHandlers(unittest.TestCase):
    @patch("backend.docker_monitor.SocketIO")
    @patch("backend.docker_monitor.DockerService")
    def setUp(self, mock_docker_service, mock_socketio):
        from backend.docker_monitor import FlaskApp

        # Configure mocks
        self.mock_socketio = MagicMock()
        mock_socketio.return_value = self.mock_socketio

        self.mock_docker_service = MagicMock()
        mock_docker_service.return_value = self.mock_docker_service

        # Create app instance
        self.app_instance = FlaskApp()
        self.app = self.app_instance.app
        self.app.config["TESTING"] = True
        self.app.config["SERVER_NAME"] = "localhost"

        # Set up request context for WebSocket tests
        self.request_context = self.app.test_request_context()
        self.request_context.push()

        # Mock request object for WebSocket handlers
        self.mock_request = MagicMock()
        self.mock_request.sid = "test-sid"
        self.mock_request.remote_addr = "127.0.0.1"
        self.mock_request.args = {}
        self.mock_request.headers = {}

        # Patch flask.request with our mock
        self.request_patcher = patch(
            "backend.docker_monitor.request", self.mock_request
        )
        self.request_patcher.start()

        # Set docker_service on app instance
        self.app_instance.docker_service = self.mock_docker_service

        # Create a mock container for use in tests
        self.mock_container = MagicMock()
        self.mock_container.id = "test-container-id"
        self.mock_container.name = "test-container"
        self.mock_container.image = "test-image"
        self.mock_container.status = "Up 2 hours"
        self.mock_container.state = "running"
        self.mock_container.ports = "80/tcp->8080"
        self.mock_container.compose_project = "test-project"
        self.mock_container.compose_service = "test-service"
        self.mock_container.created = datetime.now()

    def tearDown(self):
        # Stop request patcher
        self.request_patcher.stop()

        # Pop request context
        self.request_context.pop()

    def test_websocket_connect(self):
        # Configure mock to return container data
        self.mock_docker_service.get_all_containers.return_value = (
            [self.mock_container],
            None,
        )

        # Direct approach - register a fake handler for 'connect' event
        self.mock_socketio.on.reset_mock()  # Reset the mock to clear previous calls
        self.mock_socketio.emit.reset_mock()

        # Directly call the setup method to register handlers
        with patch("backend.docker_monitor.request", self.mock_request):
            self.app_instance.setup_websocket_handlers()

            # Get the call arguments for the socketio.on decorator
            connect_handler = None
            for call_args in self.mock_socketio.on.call_args_list:
                args, kwargs = call_args
                if args and args[0] == "connect":
                    # Found the connect handler
                    connect_handler = self.mock_socketio.on.return_value
                    # Call the handler
                    connect_handler()
                    break

            # If we didn't find the handler, fail the test
            self.assertIsNotNone(connect_handler, "Could not find connect handler")

        # Verify connection_established was emitted
        self.mock_socketio.emit.assert_any_call(
            "connection_established",
            {"message": "WebSocket connection established"},
            room="test-sid",
        )

        # Verify get_all_containers was called to get initial state
        self.mock_docker_service.get_all_containers.assert_called_once()

        # Verify initial_state was emitted with container data
        self.mock_socketio.emit.assert_any_call(
            "initial_state",
            {
                "containers": [
                    {
                        "container_id": "test-container-id",
                        "name": "test-container",
                        "image": "test-image",
                        "status": "Up 2 hours",
                        "state": "running",
                        "ports": "80/tcp->8080",
                        "compose_project": "test-project",
                        "compose_service": "test-service",
                        "created": self.mock_container.created.isoformat(),
                    }
                ]
            },
            to="test-sid",
        )

    def test_websocket_log_stream(self):
        # Mock log stream generator
        self.mock_docker_service.stream_container_logs.return_value = [
            "Log line 1",
            "Log line 2",
        ]

        # Mock socketio server manager rooms
        self.mock_socketio.server = MagicMock()
        self.mock_socketio.server.manager.rooms = {"test-sid": {"/": True}}

        # Reset the mock to clear previous calls
        self.mock_socketio.on.reset_mock()
        self.mock_socketio.emit.reset_mock()

        # Set up the mock to actually call the handler when log_stream is triggered
        with patch("backend.docker_monitor.request", self.mock_request):
            # Re-setup the websocket handlers to get fresh callbacks
            self.app_instance.setup_websocket_handlers()

            # Find the handler for start_log_stream
            start_log_stream_handler = None
            for call_args in self.mock_socketio.on.call_args_list:
                args, kwargs = call_args
                if args and args[0] == "start_log_stream":
                    # Found the handler
                    start_log_stream_handler = self.mock_socketio.on.return_value
                    # Call it directly with the container ID
                    start_log_stream_handler({"container_id": "test_container"})
                    break

            # If we didn't find the handler, fail the test
            self.assertIsNotNone(
                start_log_stream_handler, "Could not find start_log_stream handler"
            )

        # Verify stream was started
        self.mock_docker_service.stream_container_logs.assert_called_with(
            "test_container"
        )

        # Verify logs were emitted to client
        expected_calls = [
            call(
                "log_update",
                {"container_id": "test_container", "log": "Log line 1"},
                room="test-sid",
            ),
            call(
                "log_update",
                {"container_id": "test_container", "log": "Log line 2"},
                room="test-sid",
            ),
        ]

        # Check that each expected call is in the actual calls
        for expected_call in expected_calls:
            self.assertIn(expected_call, self.mock_socketio.emit.call_args_list)

    def test_websocket_log_stream_missing_container_id(self):
        # Reset the mock to clear previous calls
        self.mock_socketio.on.reset_mock()
        self.mock_socketio.emit.reset_mock()

        # Similar approach - call the handler directly with empty data
        with patch("backend.docker_monitor.request", self.mock_request):
            # Re-setup the websocket handlers to get fresh callbacks
            self.app_instance.setup_websocket_handlers()

            # Find the handler for start_log_stream
            start_log_stream_handler = None
            for call_args in self.mock_socketio.on.call_args_list:
                args, kwargs = call_args
                if args and args[0] == "start_log_stream":
                    # Found the handler
                    start_log_stream_handler = self.mock_socketio.on.return_value
                    # Call it with empty data
                    start_log_stream_handler({})
                    break

            # If we didn't find the handler, fail the test
            self.assertIsNotNone(
                start_log_stream_handler, "Could not find start_log_stream handler"
            )

        # Verify error was emitted
        self.mock_socketio.emit.assert_any_call(
            "error", {"error": "Container ID is required"}, room="test-sid"
        )

        # Verify stream was not started
        self.mock_docker_service.stream_container_logs.assert_not_called()

    def test_websocket_disconnect(self):
        # Reset the mock to clear previous calls
        self.mock_socketio.on.reset_mock()

        # Similar approach - call the handler directly
        with patch("backend.docker_monitor.request", self.mock_request):
            # Re-setup the websocket handlers to get fresh callbacks
            self.app_instance.setup_websocket_handlers()

            # Find the handler for disconnect
            disconnect_handler = None
            for call_args in self.mock_socketio.on.call_args_list:
                args, kwargs = call_args
                if args and args[0] == "disconnect":
                    # Found the handler
                    disconnect_handler = self.mock_socketio.on.return_value
                    # Call it with a test reason
                    disconnect_handler("test_reason")
                    break

            # If we didn't find the handler, fail the test
            self.assertIsNotNone(
                disconnect_handler, "Could not find disconnect handler"
            )

        # No specific assertions needed here, just verifying it doesn't raise exceptions
        # In a real test, you might want to verify any cleanup operations


if __name__ == "__main__":
    unittest.main()
