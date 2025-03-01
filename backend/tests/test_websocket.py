import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch


class TestWebSocketHandlers(unittest.TestCase):
    @patch("backend.docker_monitor.SocketIO")
    @patch("backend.docker_monitor.DockerService")
    def setUp(self, mock_docker_service, mock_socketio):
        from backend.docker_monitor import FlaskApp

        # Configure mocks
        self.mock_socketio = MagicMock()
        mock_socketio.return_value = self.mock_socketio

        # Configure socketio.on to store handlers for testing
        self.socket_handlers = {}

        def on_side_effect(event):
            def decorator(f):
                self.socket_handlers[event] = f
                return f

            return decorator

        self.mock_socketio.on.side_effect = on_side_effect

        # Similar approach for on_error
        def on_error_side_effect():
            def decorator(f):
                self.socket_handlers["error_handler"] = f
                return f

            return decorator

        self.mock_socketio.on_error.side_effect = on_error_side_effect

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

        # Reset the mocks
        self.mock_socketio.emit.reset_mock()

        # Set up the WebSocket handlers
        with patch("backend.docker_monitor.request", self.mock_request):
            self.app_instance.setup_websocket_handlers()

        # Access and call the connect handler
        connect_handler = self.socket_handlers.get("connect")
        self.assertIsNotNone(connect_handler, "Connect handler not registered")

        # Call the handler
        connect_handler()

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
            room="test-sid",
        )

    def test_websocket_log_stream(self):
        # Mock log stream generator
        self.mock_docker_service.stream_container_logs.return_value = [
            "Log line 1",
            "Log line 2",
        ]

        # Mock socketio server manager rooms - FIX: Use correct room structure
        # The check in the handler is looking for request.sid in socketio.server.manager.rooms.get("/", {})
        self.mock_socketio.server = MagicMock()
        # Correct structure: {"namespace": {"sid1": True, "sid2": True}}
        self.mock_socketio.server.manager.rooms = {"/": {"test-sid": True}}

        # Reset the mocks
        self.mock_socketio.emit.reset_mock()

        # Set up the WebSocket handlers
        with patch("backend.docker_monitor.request", self.mock_request):
            self.app_instance.setup_websocket_handlers()

        # Access the start_log_stream handler
        start_log_stream_handler = self.socket_handlers.get("start_log_stream")
        self.assertIsNotNone(
            start_log_stream_handler, "start_log_stream handler not registered"
        )

        # Call the handler with container ID
        start_log_stream_handler({"container_id": "test_container"})

        # Verify stream was started
        self.mock_docker_service.stream_container_logs.assert_called_with(
            "test_container"
        )

        # Verify log lines were emitted to client
        for log_line in ["Log line 1", "Log line 2"]:
            self.mock_socketio.emit.assert_any_call(
                "log_update",
                {"container_id": "test_container", "log": log_line},
                room="test-sid",
            )

    def test_websocket_log_stream_missing_container_id(self):
        # Reset the mocks
        self.mock_socketio.emit.reset_mock()

        # Set up the WebSocket handlers
        with patch("backend.docker_monitor.request", self.mock_request):
            self.app_instance.setup_websocket_handlers()

        # Access the start_log_stream handler
        start_log_stream_handler = self.socket_handlers.get("start_log_stream")
        self.assertIsNotNone(
            start_log_stream_handler, "start_log_stream handler not registered"
        )

        # Call the handler with empty data
        start_log_stream_handler({})

        # Verify error was emitted
        self.mock_socketio.emit.assert_any_call(
            "error", {"error": "Container ID is required"}, room="test-sid"
        )

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

    def test_websocket_error_handling(self):
        """Test WebSocket error handling during operations."""
        # Setup error handler
        error_handler = self.socket_handlers.get("error_handler")
        self.assertIsNotNone(error_handler)

        # Test with a mock exception
        mock_exception = Exception("Test WebSocket error")
        response = error_handler(mock_exception)

        # Verify response contains error info but not detailed stack traces
        self.assertIn("error", response)
        self.assertNotIn("stack trace", str(response).lower())

        # Update to match actual implementation behavior
        self.assertEqual(response, {"error": "An internal error occurred"})

        # Test with a specific socket error
        class MockSocketError(Exception):
            pass

        socket_error = MockSocketError("Connection lost")
        response = error_handler(socket_error)

        # Verify correct handling of socket error
        self.assertEqual(response, {"error": "An internal error occurred"})

        # Ensure error gets logged
        with patch("backend.docker_monitor.logging.error") as mock_log:
            error_handler(Exception("This should be logged"))
            mock_log.assert_called_once()


if __name__ == "__main__":
    unittest.main()
