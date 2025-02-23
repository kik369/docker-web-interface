import json
import logging
import time
import uuid
from contextvars import ContextVar
from datetime import datetime
from functools import wraps
from typing import Optional

from flask import g, request

# Context variable to store request ID
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class CustomJsonFormatter(logging.Formatter):
    """Custom JSON formatter that ensures timestamp and level are always set."""

    def format(self, record):
        # Ensure timestamp is present
        if not hasattr(record, "timestamp"):
            record.timestamp = datetime.utcnow().isoformat()

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
            record.timestamp = datetime.utcnow().isoformat()
        if not hasattr(record, "level"):
            record.level = record.levelname
        return True


def get_request_id() -> str:
    """Get the current request ID or generate a new one."""
    try:
        return g.request_id
    except Exception:
        return str(uuid.uuid4())


def set_request_id(request_id: Optional[str] = None) -> str:
    """Set the request ID for the current context."""
    if request_id is None:
        request_id = str(uuid.uuid4())
    request_id_var.set(request_id)
    return request_id


def log_request():
    """Decorator to log request details and timing."""

    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            # Set request ID
            request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
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

            try:
                response = f(*args, **kwargs)
                status_code = response.status_code
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

            return response

        return wrapped

    return decorator


def setup_logging():
    """Initialize logging with request ID tracking and proper formatting."""
    # Remove any existing handlers from the root logger
    root_logger = logging.getLogger()
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Create handler
    handler = logging.StreamHandler()

    # Set formatter
    formatter = CustomJsonFormatter()
    handler.setFormatter(formatter)

    # Configure root logger
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(handler)

    # Configure specific loggers
    loggers = ["docker_service", "docker_monitor", "engineio.server"]
    for logger_name in loggers:
        logger = logging.getLogger(logger_name)
        # Remove any existing handlers
        for h in logger.handlers[:]:
            logger.removeHandler(h)
        # Add our custom handler and filter
        logger.addHandler(handler)
        logger.addFilter(RequestIdFilter())
        logger.propagate = False  # Prevent duplicate logs
        logger.setLevel(logging.INFO)
