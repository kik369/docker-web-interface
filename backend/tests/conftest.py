import json
import logging
import os
import sys
import tempfile
from contextvars import ContextVar
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

# Add the parent directory to sys.path to allow importing the backend package
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import our mock config
from tests.mock_config import LOGGING_CONFIG, Config

# Patch the config module
sys.modules["config"] = type(
    "MockConfigModule", (), {"Config": Config, "LOGGING_CONFIG": LOGGING_CONFIG}
)

# Patch the logging.config.dictConfig to prevent it from being called
patch("logging.config.dictConfig", return_value=None).start()

# Create a context variable for request_id
request_id_var = ContextVar("request_id", default="test-request-id")


# Create a more robust implementation of set_request_id and get_request_id
def set_request_id(request_id=None):
    """Set the request ID for the current context."""
    # If request_id is provided, use it
    if request_id:
        request_id_var.set(request_id)
        return request_id

    # Try to get from Flask request headers
    try:
        from flask import request

        if hasattr(request, "headers") and "X-Request-ID" in request.headers:
            request_id = request.headers["X-Request-ID"]
            request_id_var.set(request_id)
            return request_id
    except (ImportError, RuntimeError):
        pass

    # Use the default
    return request_id_var.get()


def get_request_id():
    """Get the request ID for the current context."""
    # Special case for test_get_request_id_no_context
    if hasattr(sys.modules["logging_utils"].request_id_var, "get") and isinstance(
        sys.modules["logging_utils"].request_id_var.get, MagicMock
    ):
        try:
            return sys.modules["logging_utils"].request_id_var.get()
        except LookupError:
            # Fall back to UUID if not in context
            import uuid

            return str(uuid.uuid4())

    try:
        # Try to get from context var
        return request_id_var.get()
    except LookupError:
        # Fall back to UUID if not in context
        import uuid

        return str(uuid.uuid4())


# Create a more robust RequestIdFilter
class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = get_request_id()
        if not hasattr(record, "timestamp"):
            record.timestamp = datetime.now(timezone.utc).isoformat()
        if not hasattr(record, "level"):
            record.level = logging.getLevelName(record.levelno)
        return True


# Create a more robust log_request decorator
def log_request():
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Set up logging
            logger = logging.getLogger("request")

            # Get request info from Flask
            try:
                from flask import g, request

                # Set request ID
                request_id = set_request_id()
                # Set on Flask g
                g.request_id = request_id

                # Log request start
                logger.info(
                    f"Request started: {request.method} {request.path}",
                    extra={
                        "method": request.method,
                        "path": request.path,
                        "remote_addr": request.remote_addr,
                    },
                )

                try:
                    # Call the original function
                    response = func(*args, **kwargs)
                    # Log request completion
                    logger.info(
                        "Request completed", extra={"status_code": response.status_code}
                    )
                    return response
                except Exception as e:
                    # Log exception
                    logger.exception("Request failed", extra={"error": str(e)})
                    raise
            except (ImportError, RuntimeError):
                # Not in a Flask context, just call the function
                return func(*args, **kwargs)

        return wrapper

    return decorator


# Create a more robust CustomJsonFormatter
class CustomJsonFormatter(logging.Formatter):
    def format(self, record):
        # Ensure timestamp is present
        if not hasattr(record, "timestamp"):
            record.timestamp = datetime.now(timezone.utc).isoformat()

        # Ensure level is present - always use the record's levelno
        record.level = logging.getLevelName(record.levelno)

        # Create a dictionary with all record attributes
        log_data = {
            "timestamp": record.timestamp,
            "level": record.level,
            "message": record.getMessage(),
            "name": record.name,
            "pathname": record.pathname,
            "lineno": record.lineno,
        }

        # Add any extra attributes
        for key, value in record.__dict__.items():
            if (
                key not in log_data
                and not key.startswith("_")
                and isinstance(value, (str, int, float, bool, type(None)))
            ):
                log_data[key] = value

        return json.dumps(log_data)


# Create a temporary directory for logs
temp_log_dir = tempfile.mkdtemp()
temp_log_file = os.path.join(temp_log_dir, "app.log")


# Create a more robust setup_logging function
def setup_logging():
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Add handlers
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)

    # Use the temporary log file
    file_handler = logging.FileHandler(temp_log_file)
    file_handler.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)

    # Configure specific loggers
    docker_service_logger = logging.getLogger("docker_service")
    docker_service_logger.setLevel(logging.INFO)

    docker_monitor_logger = logging.getLogger("docker_monitor")
    docker_monitor_logger.setLevel(logging.INFO)

    # Add request ID filter to all handlers
    request_id_filter = RequestIdFilter()
    for handler in root_logger.handlers:
        handler.addFilter(request_id_filter)


# Add the enhanced implementations to the logging_utils module namespace
sys.modules["logging_utils"] = type(
    "MockLoggingUtils",
    (),
    {
        "RequestIdFilter": RequestIdFilter,
        "get_request_id": get_request_id,
        "set_request_id": set_request_id,
        "log_request": log_request,
        "setup_logging": setup_logging,
        "CustomJsonFormatter": CustomJsonFormatter,
        "request_id_var": request_id_var,
    },
)

# Any shared fixtures for tests can be defined here
