import logging
import unittest
from unittest.mock import MagicMock, patch

from flask import Flask

from backend.logging_utils import (
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

                        # Verify logging calls
                        self.assertEqual(mock_g.request_id, "existing-id")
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


if __name__ == "__main__":
    unittest.main()
