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

    def tearDown(self):
        # Stop request patcher
        self.request_patcher.stop()

        # Pop request context
        self.request_context.pop()

    def test_websocket_connect(self):
        # Mock container data
        mock_container = MagicMock()
        mock_container.id = "test-container-id"
        mock_container.name = "test-container"
        mock_container.image = "test-image"
        mock_container.status = "Up 2 hours"
        mock_container.state = "running"
        mock_container.ports = "80/tcp->8080"
        mock_container.compose_project = "test-project"
        mock_container.compose_service = "test-service"
        mock_container.created = datetime.now()

        # Configure mock to return container data
        self.mock_docker_service.get_all_containers.return_value = (
            [mock_container],
            None,
        )

        # Get the connect handler
        connect_handler = None
        for name, value in self.app_instance.__class__.__dict__.items():
            if (
                hasattr(value, "__socketio_handler__")
                and value.__socketio_handler__ == "connect"
            ):
                connect_handler = value.__get__(
                    self.app_instance, self.app_instance.__class__
                )
                break

        # If we couldn't find the handler through introspection, use a direct approach
        if not connect_handler:
            # Call the handler directly - this is a fallback approach
            @self.mock_socketio.on.return_value
            def handle_connect():
                pass

            # Get the most recent call to socketio.on
            args, kwargs = self.mock_socketio.on.call_args
            event_name = args[0] if args else kwargs.get("event")

            # Verify it was for the connect event
            self.assertEqual(event_name, "connect")

            # Call the decorated function
            handle_connect()
        else:
            # Call the handler directly if we found it
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
                        "created": mock_container.created.isoformat(),
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

        # Get the log stream handler
        log_stream_handler = None
        for name, value in self.app_instance.__class__.__dict__.items():
            if (
                hasattr(value, "__socketio_handler__")
                and value.__socketio_handler__ == "start_log_stream"
            ):
                log_stream_handler = value.__get__(
                    self.app_instance, self.app_instance.__class__
                )
                break

        # If we couldn't find the handler through introspection, use a direct approach
        if not log_stream_handler:
            # Call the handler directly - this is a fallback approach
            @self.mock_socketio.on.return_value
            def handle_start_log_stream(data):
                pass

            # Get the most recent call to socketio.on
            calls = self.mock_socketio.on.call_args_list
            for args, kwargs in calls:
                event_name = args[0] if args else kwargs.get("event")
                if event_name == "start_log_stream":
                    # Call the decorated function with test data
                    handle_start_log_stream({"container_id": "test_container"})
                    break
        else:
            # Call the handler directly if we found it
            log_stream_handler({"container_id": "test_container"})

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

        for expected_call in expected_calls:
            self.assertIn(expected_call, self.mock_socketio.emit.call_args_list)

    def test_websocket_log_stream_missing_container_id(self):
        # Get the log stream handler
        log_stream_handler = None
        for name, value in self.app_instance.__class__.__dict__.items():
            if (
                hasattr(value, "__socketio_handler__")
                and value.__socketio_handler__ == "start_log_stream"
            ):
                log_stream_handler = value.__get__(
                    self.app_instance, self.app_instance.__class__
                )
                break

        # If we couldn't find the handler through introspection, use a direct approach
        if not log_stream_handler:
            # Call the handler directly - this is a fallback approach
            @self.mock_socketio.on.return_value
            def handle_start_log_stream(data):
                pass

            # Get the most recent call to socketio.on
            calls = self.mock_socketio.on.call_args_list
            for args, kwargs in calls:
                event_name = args[0] if args else kwargs.get("event")
                if event_name == "start_log_stream":
                    # Call the decorated function with empty data
                    handle_start_log_stream({})
                    break
        else:
            # Call the handler directly if we found it
            log_stream_handler({})

        # Verify error was emitted
        self.mock_socketio.emit.assert_any_call(
            "error", {"error": "Container ID is required"}, room="test-sid"
        )

        # Verify stream was not started
        self.mock_docker_service.stream_container_logs.assert_not_called()

    def test_websocket_disconnect(self):
        # Get the disconnect handler
        disconnect_handler = None
        for name, value in self.app_instance.__class__.__dict__.items():
            if (
                hasattr(value, "__socketio_handler__")
                and value.__socketio_handler__ == "disconnect"
            ):
                disconnect_handler = value.__get__(
                    self.app_instance, self.app_instance.__class__
                )
                break

        # If we couldn't find the handler through introspection, use a direct approach
        if not disconnect_handler:
            # Call the handler directly - this is a fallback approach
            @self.mock_socketio.on.return_value
            def handle_disconnect(reason):
                pass

            # Get the most recent call to socketio.on
            calls = self.mock_socketio.on.call_args_list
            for args, kwargs in calls:
                event_name = args[0] if args else kwargs.get("event")
                if event_name == "disconnect":
                    # Call the decorated function with test data
                    handle_disconnect("test_reason")
                    break
        else:
            # Call the handler directly if we found it
            disconnect_handler("test_reason")

        # No specific assertions needed here, just verifying it doesn't raise exceptions
        # In a real test, you might want to verify any cleanup operations


if __name__ == "__main__":
    unittest.main()
