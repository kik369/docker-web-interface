import logging
import time
import uuid
from contextvars import ContextVar
from functools import wraps
from typing import Optional

from flask import g, request

# Context variable to store request ID
request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class RequestIdFilter(logging.Filter):
    """Logging filter that adds request ID to log records."""

    def filter(self, record):
        record.request_id = request_id_var.get()
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
    """Initialize logging with request ID tracking."""
    logging.getLogger("docker_service").addFilter(RequestIdFilter())
