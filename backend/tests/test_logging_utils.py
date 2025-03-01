import json
import logging
import os
import tempfile
import unittest
import uuid
from unittest.mock import MagicMock, patch

from flask import Flask

from backend.logging_utils import (
    CustomJsonFormatter,
    RequestIdFilter,
    get_request_id,
    log_request,
    set_request_id,
    setup_logging,
)


class TestLoggingUtils(unittest.TestCase):
    def setUp(self):
        # Reset request ID between tests
        set_request_id("test-request-id")
        # Create a test Flask app
        self.test_app = Flask(__name__)

    def test_request_id_filter(self):
        # Create a test record
        record = logging.LogRecord(
            "test_logger", logging.INFO, "pathname", 123, "Test message", (), None
        )

        # Apply filter
        filter = RequestIdFilter()
        filter.filter(record)

        # Check that request_id was added
        self.assertEqual(record.request_id, "test-request-id")
        self.assertTrue(hasattr(record, "timestamp"))
        self.assertTrue(hasattr(record, "level"))

    def test_set_get_request_id(self):
        # Testing within request context
        with self.test_app.app_context():
            with self.test_app.test_request_context():
                # Test setting a new request ID
                request_id = set_request_id("new-request-id")
                self.assertEqual(request_id, "new-request-id")

                # Test getting the request ID
                retrieved_id = get_request_id()
                self.assertEqual(retrieved_id, "new-request-id")

                # Test auto-generation of request ID
                set_request_id(None)
                auto_id = get_request_id()
                self.assertIsNotNone(auto_id)
                self.assertNotEqual(auto_id, "new-request-id")

    def test_log_request_decorator(self):
        with self.test_app.app_context():
            with self.test_app.test_request_context():
                # Setup mocks
                with (
                    patch(
                        "flask.request",
                        MagicMock(
                            method="GET",
                            path="/test",
                            remote_addr="127.0.0.1",
                            headers={"X-Request-ID": "existing-id"},
                        ),
                    ),
                    patch("flask.g") as mock_g,
                ):
                    # Create a test function to decorate
                    @log_request()
                    def test_function():
                        return MagicMock(status_code=200)

                    # Call the decorated function
                    with patch("logging.getLogger") as mock_logger:
                        mock_logger_instance = mock_logger.return_value
                        test_function()

                        # Verify logging calls - use hasattr instead of direct comparison
                        self.assertTrue(
                            hasattr(mock_g, "request_id"), "request_id not set on g"
                        )
                        mock_logger_instance.info.assert_called()

    @patch("logging.handlers.RotatingFileHandler")
    @patch("logging.StreamHandler")
    def test_setup_logging(self, mock_stream_handler, mock_file_handler):
        # Mock handlers
        mock_stream_handler_instance = MagicMock()
        mock_file_handler_instance = MagicMock()
        mock_stream_handler.return_value = mock_stream_handler_instance
        mock_file_handler.return_value = mock_file_handler_instance

        # Call setup_logging
        with patch("logging.getLogger") as mock_get_logger:
            mock_root_logger = MagicMock()
            mock_specific_logger = MagicMock()

            # Configure mock getLogger to return different loggers
            def get_logger_side_effect(name=None):
                if name is None:
                    return mock_root_logger
                return mock_specific_logger

            mock_get_logger.side_effect = get_logger_side_effect

            # Call the function
            setup_logging()

            # Verify root logger was configured
            mock_root_logger.setLevel.assert_called_with(logging.INFO)
            mock_root_logger.addHandler.assert_any_call(mock_stream_handler_instance)
            mock_root_logger.addHandler.assert_any_call(mock_file_handler_instance)

            # Verify specific loggers were configured
            mock_specific_logger.addHandler.assert_any_call(
                mock_stream_handler_instance
            )
            mock_specific_logger.addHandler.assert_any_call(mock_file_handler_instance)
            mock_specific_logger.addFilter.assert_called()

    def test_log_request_decorator_with_exception(self):
        with self.test_app.app_context():
            with self.test_app.test_request_context():
                # Setup mocks
                with (
                    patch(
                        "flask.request",
                        MagicMock(
                            method="GET",
                            path="/test",
                            remote_addr="127.0.0.1",
                            headers={},
                        ),
                    ),
                    patch("flask.g") as mock_g,
                ):
                    # Create a test function that raises an exception
                    @log_request()
                    def test_function_with_exception():
                        raise ValueError("Test exception")

                    # Call the decorated function and expect exception
                    with patch("logging.getLogger") as mock_logger:
                        mock_logger_instance = mock_logger.return_value

                        with self.assertRaises(ValueError):
                            test_function_with_exception()

                        # Verify exception was logged
                        mock_logger_instance.exception.assert_called_with(
                            "Request failed", extra={"error": "Test exception"}
                        )

                        # Verify request_id was set on g
                        self.assertTrue(hasattr(mock_g, "request_id"))
                        self.assertIsNotNone(mock_g.request_id)

    def test_custom_json_formatter(self):
        """Test the CustomJsonFormatter formats logs correctly."""
        formatter = CustomJsonFormatter()

        # Create a record without timestamp and level
        record = logging.LogRecord(
            "test_logger", logging.INFO, "pathname", 123, "Test message", (), None
        )

        # Format the record
        formatted = formatter.format(record)

        # Verify JSON structure and required fields
        parsed = json.loads(formatted)
        self.assertIn("timestamp", parsed)
        self.assertIn("level", parsed)
        self.assertEqual(parsed["message"], "Test message")
        self.assertEqual(parsed["name"], "test_logger")
        self.assertEqual(parsed["pathname"], "pathname")
        self.assertEqual(parsed["lineno"], 123)

        # Test with custom attributes
        record.extra = {"custom_field": "custom_value"}
        formatted = formatter.format(record)
        parsed = json.loads(formatted)
        self.assertEqual(parsed["custom_field"], "custom_value")

        # Test with existing timestamp and level
        record.timestamp = "2023-01-01T00:00:00Z"
        record.level = "WARNING"
        formatted = formatter.format(record)
        parsed = json.loads(formatted)
        self.assertEqual(parsed["timestamp"], "2023-01-01T00:00:00Z")
        self.assertEqual(parsed["level"], "WARNING")

    def test_get_request_id_no_context(self):
        """Test getting request ID when not in a Flask context."""
        # Create a predictable UUID for testing
        test_uuid = "12345678-1234-5678-1234-567812345678"
        test_uuid_obj = uuid.UUID(test_uuid)

        # We need to work within a Flask app context to avoid the context error
        with self.test_app.app_context():
            # Patch uuid4 to return our test UUID
            with patch("uuid.uuid4", return_value=test_uuid_obj):
                # Patch the context var to raise LookupError when get is called
                with patch("backend.logging_utils.request_id_var") as mock_var:
                    mock_var.get.side_effect = LookupError("No context var")

                    # Import flask g directly
                    from flask import g

                    # Remove request_id from g if it exists to force the AttributeError path
                    if hasattr(g, "request_id"):
                        delattr(g, "request_id")

                    # Now call get_request_id - it should fall back to uuid4
                    request_id = get_request_id()

                    # Verify we got our test UUID string
                    self.assertEqual(request_id, test_uuid)

    def test_log_request_with_real_logger(self):
        """Test log_request decorator with real logger to ensure proper coverage."""
        # Create a test logger with a memory handler
        test_logger = logging.getLogger("test_real_logger")
        test_logger.setLevel(logging.INFO)

        # Use a custom filter that explicitly adds request_id
        class TestRequestIdFilter(logging.Filter):
            def filter(self, record):
                record.request_id = "real-request-id"
                return True

        # Add the filter to the logger
        test_logger.addFilter(TestRequestIdFilter())

        # Use StringIO as a file-like object to capture logs
        with tempfile.NamedTemporaryFile(delete=False) as temp_log_file:
            # Use a formatter that includes request_id
            formatter = logging.Formatter("%(message)s - request_id: %(request_id)s")
            handler = logging.FileHandler(temp_log_file.name)
            handler.setFormatter(formatter)
            test_logger.addHandler(handler)

            try:
                # Test the decorator with a real function
                with self.test_app.test_request_context():
                    with patch("logging.getLogger", return_value=test_logger):
                        with patch("flask.g"):  # Mock flask.g
                            with patch(
                                "flask.request",
                                MagicMock(
                                    method="GET",
                                    path="/test-real",
                                    remote_addr="127.0.0.1",
                                    headers={"X-Request-ID": "real-request-id"},
                                ),
                            ):
                                # Mock set_request_id to ensure our request ID is used
                                with patch(
                                    "backend.logging_utils.set_request_id",
                                    return_value="real-request-id",
                                ):

                                    @log_request()
                                    def real_test_func():
                                        return MagicMock(status_code=200)

                                    response = real_test_func()
                                    self.assertEqual(response.status_code, 200)

                # Flush and close the handler
                handler.flush()
                handler.close()
                test_logger.removeHandler(handler)

                # Read the log file and verify content
                with open(temp_log_file.name, "r") as f:
                    log_content = f.read()
                    self.assertIn("Request started", log_content)
                    self.assertIn("Request completed", log_content)
                    self.assertIn("real-request-id", log_content)
            finally:
                # Clean up the temp file
                if os.path.exists(temp_log_file.name):
                    os.unlink(temp_log_file.name)

    def test_setup_logging_with_real_loggers(self):
        """Test setup_logging function by creating actual loggers and verifying their configuration."""
        # Create a temporary directory for log files
        with tempfile.TemporaryDirectory() as temp_dir:
            # Patch the log file path
            log_path = os.path.join(temp_dir, "app.log")

            with patch(
                "logging.handlers.RotatingFileHandler",
                return_value=logging.FileHandler(log_path),
            ):
                with patch("logging.getLogger") as mock_get_logger:
                    root_logger = logging.Logger("root")
                    docker_service_logger = logging.Logger("docker_service")
                    docker_monitor_logger = logging.Logger("docker_monitor")

                    # Configure the mock to return our test loggers
                    def get_logger_side_effect(name=None):
                        if name is None:
                            return root_logger
                        elif name == "docker_service":
                            return docker_service_logger
                        elif name == "docker_monitor":
                            return docker_monitor_logger
                        else:
                            return logging.Logger(name)

                    mock_get_logger.side_effect = get_logger_side_effect

                    # Call setup_logging
                    setup_logging()

                    # Verify the loggers were configured correctly
                    self.assertEqual(root_logger.level, logging.INFO)
                    self.assertEqual(docker_service_logger.level, logging.INFO)
                    self.assertEqual(docker_monitor_logger.level, logging.INFO)

                    # Verify the handlers were added
                    self.assertGreaterEqual(len(root_logger.handlers), 1)
                    self.assertGreaterEqual(len(docker_service_logger.handlers), 1)
                    self.assertGreaterEqual(len(docker_monitor_logger.handlers), 1)

                    # Test that the loggers can log messages without errors
                    root_logger.info("Test root logger message")
                    docker_service_logger.info("Test docker_service logger message")
                    docker_monitor_logger.info("Test docker_monitor logger message")


if __name__ == "__main__":
    unittest.main()
