import json
import logging
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone  # Added timezone import
from functools import wraps
from typing import Optional

from flask import g, request

try:
    # For Docker environment
    from config import Config
except ImportError:
    # For local development
    pass

# Context variable to store request ID
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class CustomJsonFormatter(logging.Formatter):
    """Custom JSON formatter that ensures timestamp and level are always set."""

    def format(self, record):
        # Ensure timestamp is present
        if not hasattr(record, "timestamp"):
            record.timestamp = datetime.now(timezone.utc).isoformat()

        # Ensure level is present
        if not hasattr(record, "level"):
            record.level = record.levelname

        # Create the message dict
        message_dict = {
            "timestamp": record.timestamp,
            "level": record.level,
            "name": record.name,
            "message": record.getMessage(),
            "pathname": record.pathname,
            "lineno": record.lineno,
            "funcName": record.funcName,
            "process": record.process,
            "thread": record.thread,
            "request_id": getattr(record, "request_id", ""),
        }

        # Add any extra attributes
        if hasattr(record, "extra"):
            message_dict.update(record.extra)

        # Convert to JSON string
        return json.dumps(message_dict)


class RequestIdFilter(logging.Filter):
    """Logging filter that adds request ID to log records."""

    def filter(self, record):
        record.request_id = request_id_var.get()
        # Add timestamp and level if not present
        if not hasattr(record, "timestamp"):
            record.timestamp = datetime.now(timezone.utc).isoformat()
        if not hasattr(record, "level"):
            record.level = record.levelname
        return True


def get_request_id() -> str:
    """Get the current request ID or generate a new one."""
    try:
        return g.request_id  # Try Flask g first
    except (RuntimeError, AttributeError):
        try:
            return request_id_var.get()  # Fall back to context var
        except LookupError:
            return str(uuid.uuid4())  # Generate new as last resort


def set_request_id(request_id: Optional[str] = None) -> str:
    """Set the request ID for the current context."""
    if request_id is None:
        request_id = str(uuid.uuid4())

    # Set in context var
    request_id_var.set(request_id)

    # Try to set in Flask g if in request context
    try:
        g.request_id = request_id
    except RuntimeError:
        pass  # Not in a request context

    return request_id


def log_request():
    """Decorator to log request details and timing."""

    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            # Set request ID
            request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
            # Set both Flask g and context var
            g.request_id = request_id
            set_request_id(request_id)

            # Get logger
            logger = logging.getLogger("docker_service")

            # Log request
            logger.info(
                "Request started",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "remote_addr": request.remote_addr,
                    "request_id": request_id,
                },
            )

            # Time the request
            start_time = time.time()
            status_code = 500  # Default status code

            try:
                response = f(*args, **kwargs)
                status_code = response.status_code
                return response
            except Exception as e:
                logger.exception("Request failed", extra={"error": str(e)})
                raise
            finally:
                duration = time.time() - start_time

                # Log request completion with metrics
                logger.info(
                    "Request completed",
                    extra={
                        "method": request.method,
                        "path": request.path,
                        "status_code": status_code,
                        "duration": duration,
                        "request_id": request_id,
                    },
                )

        return wrapped

    return decorator


def setup_logging():
    """Initialize logging with request ID tracking and proper formatting."""
    # Create handlers
    console_handler = logging.StreamHandler()
    file_handler = logging.handlers.RotatingFileHandler(
        "logs/app.log",
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
    )

    # Set formatter
    formatter = CustomJsonFormatter()
    console_handler.setFormatter(formatter)
    file_handler.setFormatter(formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Remove any existing handlers from the root logger
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Add our handlers
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    # Configure specific loggers
    loggers = ["docker_service", "docker_monitor", "engineio.server"]
    for logger_name in loggers:
        logger = logging.getLogger(logger_name)
        # Remove any existing handlers
        for h in logger.handlers[:]:
            logger.removeHandler(h)
        # Add our custom handlers and filter
        logger.addHandler(console_handler)
        logger.addHandler(file_handler)
        logger.addFilter(RequestIdFilter())
        logger.propagate = False  # Prevent duplicate logs
        logger.setLevel(logging.INFO)
