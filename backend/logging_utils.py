import json
import logging
import logging.handlers
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone  # Added timezone import
from functools import wraps
from typing import Any, Dict, Optional

from flask import g, request

# Context variables to store request and operation information
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
user_context_var: ContextVar[Dict[str, Any]] = ContextVar("user_context", default={})
operation_context_var: ContextVar[Dict[str, Any]] = ContextVar(
    "operation_context", default={}
)
performance_metrics_var: ContextVar[Dict[str, Any]] = ContextVar(
    "performance_metrics", default={}
)
system_context_var: ContextVar[Dict[str, Any]] = ContextVar(
    "system_context", default={}
)

# Standard log schema fields
STANDARD_LOG_FIELDS = [
    "timestamp",  # ISO 8601 format with timezone
    "level",  # Log level (INFO, ERROR, etc.)
    "name",  # Logger name
    "message",  # Log message
    "request_id",  # Unique request identifier
    "pathname",  # File path
    "lineno",  # Line number
    "funcName",  # Function name
    "process",  # Process ID
    "thread",  # Thread ID
]

# Standard context categories
CONTEXT_CATEGORIES = [
    "user_context",  # User-related information
    "operation_context",  # Operation-related information
    "performance_metrics",  # Performance-related metrics
    "system_context",  # System-related information
    "error_context",  # Error-related information
]


class LogContext:
    """Class to manage logging context information."""

    @staticmethod
    def set_user_context(user_id: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """Set user context information for the current context."""
        context = {}
        if user_id:
            context["user_id"] = user_id
        context.update(kwargs)
        user_context_var.set(context)
        return context

    @staticmethod
    def get_user_context() -> Dict[str, Any]:
        """Get the current user context information."""
        try:
            return user_context_var.get()
        except LookupError:
            return {}

    @staticmethod
    def set_operation_context(
        operation_type: Optional[str] = None, **kwargs
    ) -> Dict[str, Any]:
        """Set operation context information for the current context."""
        context = {}
        if operation_type:
            context["operation_type"] = operation_type
        context.update(kwargs)
        operation_context_var.set(context)
        return context

    @staticmethod
    def get_operation_context() -> Dict[str, Any]:
        """Get the current operation context information."""
        try:
            return operation_context_var.get()
        except LookupError:
            return {}

    @staticmethod
    def set_performance_metrics(**kwargs) -> Dict[str, Any]:
        """Set performance metrics for the current context."""
        metrics = performance_metrics_var.get({})
        metrics.update(kwargs)
        performance_metrics_var.set(metrics)
        return metrics

    @staticmethod
    def get_performance_metrics() -> Dict[str, Any]:
        """Get the current performance metrics."""
        try:
            return performance_metrics_var.get()
        except LookupError:
            return {}

    @staticmethod
    def set_system_context(**kwargs) -> Dict[str, Any]:
        """Set system context information for the current context."""
        context = system_context_var.get({})
        context.update(kwargs)
        system_context_var.set(context)
        return context

    @staticmethod
    def get_system_context() -> Dict[str, Any]:
        """Get the current system context information."""
        try:
            return system_context_var.get()
        except LookupError:
            return {}

    @staticmethod
    def set_error_context(
        error: Optional[Exception] = None, **kwargs
    ) -> Dict[str, Any]:
        """Set error context information for the current context."""
        context = {}
        if error:
            context["error_type"] = type(error).__name__
            context["error_message"] = str(error)
        context.update(kwargs)
        return context

    @staticmethod
    def clear():
        """Clear all context information."""
        user_context_var.set({})
        operation_context_var.set({})
        performance_metrics_var.set({})
        system_context_var.set({})


class CustomJsonFormatter(logging.Formatter):
    """Custom JSON formatter that ensures timestamp and level are always set."""

    def format(self, record):
        # Ensure timestamp is present
        if not hasattr(record, "timestamp"):
            record.timestamp = datetime.now(timezone.utc).isoformat()

        # Ensure level is present
        if not hasattr(record, "level"):
            record.level = record.levelname

        # Create the message dict with standard fields
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

        # Add user context if available
        user_context = LogContext.get_user_context()
        if user_context:
            message_dict["user_context"] = user_context

        # Add operation context if available
        operation_context = LogContext.get_operation_context()
        if operation_context:
            message_dict["operation_context"] = operation_context

        # Add performance metrics if available
        performance_metrics = LogContext.get_performance_metrics()
        if performance_metrics:
            message_dict["performance_metrics"] = performance_metrics

        # Add system context if available
        system_context = LogContext.get_system_context()
        if system_context:
            message_dict["system_context"] = system_context

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


class ContextFilter(logging.Filter):
    """Logging filter that adds context information to log records."""

    def filter(self, record):
        # Add request ID
        record.request_id = request_id_var.get()

        # Add timestamp and level if not present
        if not hasattr(record, "timestamp"):
            record.timestamp = datetime.now(timezone.utc).isoformat()
        if not hasattr(record, "level"):
            record.level = record.levelname

        # Add context information as extra fields
        if not hasattr(record, "extra"):
            record.extra = {}

        # Add user context
        user_context = LogContext.get_user_context()
        if user_context:
            record.extra["user_context"] = user_context

        # Add operation context
        operation_context = LogContext.get_operation_context()
        if operation_context:
            record.extra["operation_context"] = operation_context

        # Add performance metrics
        performance_metrics = LogContext.get_performance_metrics()
        if performance_metrics:
            record.extra["performance_metrics"] = performance_metrics

        # Add system context
        system_context = LogContext.get_system_context()
        if system_context:
            record.extra["system_context"] = system_context

        return True


class SocketErrorFilter(logging.Filter):
    """Logging filter that suppresses socket shutdown errors."""

    def filter(self, record):
        # Check if the log message contains socket shutdown error
        if hasattr(record, "msg"):
            msg = str(record.msg) if not isinstance(record.msg, str) else record.msg

            # Common socket errors to suppress
            socket_errors = [
                "socket shutdown error",
                "Bad file descriptor",
                "client disconnected",
                "transport closed",
                "connection already closed",
                "Connection reset by peer",
                "Broken pipe",
                "Socket is closed",
                "not open for writing",
                "Socket closed",
                "Client is gone",
                "Invalid session",
                "Unexpected packet",
            ]

            # Check for socket errors in both the message and any exception info
            if hasattr(record, "exc_info") and record.exc_info:
                exc_str = str(record.exc_info[1])
                for error in socket_errors:
                    if error.lower() in exc_str.lower():
                        return False

            # Check the message itself
            msg_lower = msg.lower()
            for error in socket_errors:
                if error.lower() in msg_lower:
                    return False

            # Filter based on logger name and specific conditions
            if hasattr(record, "name"):
                if record.name in [
                    "engineio.server",
                    "socketio.server",
                    "gunicorn.error",
                ]:
                    # Filter common socketio/engineio messages that aren't errors
                    common_messages = [
                        "Sending packet",
                        "Received packet",
                        "Socket connected",
                        "Socket disconnected",
                        "Client disconnected",
                        "Transport closed",
                    ]
                    for message in common_messages:
                        if message.lower() in msg_lower:
                            return False

                    # Filter socket.io specific error messages
                    if "error" in msg_lower and any(
                        err in msg_lower
                        for err in ["socket", "transport", "connection"]
                    ):
                        return False

        return True


def get_request_id() -> str:
    """Get the current request ID or generate a new one."""
    try:
        return request_id_var.get()
    except LookupError:
        new_id = str(uuid.uuid4())
        request_id_var.set(new_id)
        return new_id


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

            # Define paths that should be excluded from routine logging
            routine_paths = [
                "/api/containers",  # Container list endpoint
                "/api/images",  # Images list endpoint
            ]

            # Check if this is a routine GET request to a high-volume endpoint
            is_routine_request = request.method == "GET" and any(
                request.path.startswith(path) for path in routine_paths
            )

            # Set operation context
            LogContext.set_operation_context(
                operation_type="api_request",
                method=request.method,
                path=request.path,
                endpoint=request.endpoint,
            )

            # Set user context if available
            user_id = request.headers.get("X-User-ID")
            if user_id:
                LogContext.set_user_context(user_id=user_id)

            # Set system context
            LogContext.set_system_context(component="api", service="docker_service")

            # Initialize performance metrics
            LogContext.set_performance_metrics(start_time=time.time())

            # Log all requests at DEBUG level
            logger.debug(
                "Request started",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "remote_addr": request.remote_addr,
                    "request_id": request_id,
                },
            )

            # Only log non-routine requests at INFO level
            if not is_routine_request:
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
                # Add error context
                error_context = LogContext.set_error_context(
                    error=e,
                    endpoint=request.endpoint,
                    method=request.method,
                    path=request.path,
                )
                logger.exception(
                    "Request failed", extra={"error_context": error_context}
                )
                raise
            finally:
                duration = time.time() - start_time

                # Update performance metrics
                LogContext.set_performance_metrics(
                    duration=duration,
                    status_code=status_code,
                )

                # Always log at DEBUG level
                logger.debug(
                    "Request completed",
                    extra={
                        "method": request.method,
                        "path": request.path,
                        "status_code": status_code,
                        "duration": duration,
                        "request_id": request_id,
                    },
                )

                # Log slow requests (>500ms) or non-routine requests at INFO level
                if duration > 0.5 or not is_routine_request or status_code >= 400:
                    logger.info(
                        "Request completed",
                        extra={
                            "method": request.method,
                            "path": request.path,
                            "status_code": status_code,
                            "duration": duration,
                            "request_id": request_id,
                            "slow": duration > 0.5,
                        },
                    )

                # Clear context after request is complete
                LogContext.clear()

        return wrapped

    return decorator


def with_context(operation_type=None, **context_kwargs):
    """Decorator to add operation context to a function."""

    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            # Set operation context
            if operation_type:
                LogContext.set_operation_context(
                    operation_type=operation_type, **context_kwargs
                )

            # Initialize performance metrics
            start_time = time.time()
            LogContext.set_performance_metrics(start_time=start_time)

            try:
                result = f(*args, **kwargs)
                return result
            finally:
                # Update performance metrics
                duration = time.time() - start_time
                LogContext.set_performance_metrics(duration=duration)

        return wrapped

    return decorator


def setup_logging(
    log_level=None, log_file=None, max_bytes=10 * 1024 * 1024, backup_count=5
):
    """Initialize logging with request ID tracking and proper formatting.

    Args:
        log_level: The log level to use (defaults to INFO or from Config)
        log_file: Path to the log file (defaults to logs/app.log or from Config)
        max_bytes: Maximum size of log file before rotation
        backup_count: Number of backup log files to keep
    """
    # Try to get config from Config if available
    try:
        from config import Config

        config_log_level = getattr(Config, "LOG_LEVEL", "INFO")
        config_log_file = getattr(Config, "LOG_FILE", "logs/app.log")
    except (ImportError, AttributeError):
        config_log_level = "INFO"
        config_log_file = "logs/app.log"

    # Use provided values or fall back to config/defaults
    log_level = log_level or config_log_level
    log_file = log_file or config_log_file

    # Convert string log level to logging constant
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)

    # Ensure log directory exists
    import os

    log_dir = os.path.dirname(log_file)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir, exist_ok=True)

    # Create handlers
    console_handler = logging.StreamHandler()
    file_handler = logging.handlers.RotatingFileHandler(
        log_file,
        maxBytes=max_bytes,
        backupCount=backup_count,
    )

    # Set formatter
    formatter = CustomJsonFormatter()
    console_handler.setFormatter(formatter)
    file_handler.setFormatter(formatter)

    # Add socket error filter to both handlers
    socket_error_filter = SocketErrorFilter()
    console_handler.addFilter(socket_error_filter)
    file_handler.addFilter(socket_error_filter)

    # Add context filter to both handlers
    context_filter = ContextFilter()
    console_handler.addFilter(context_filter)
    file_handler.addFilter(context_filter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Remove any existing handlers from the root logger
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Add our handlers
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    # Add socket error filter directly to root logger
    root_logger.addFilter(socket_error_filter)

    # Configure specific loggers
    loggers = ["docker_service", "docker_monitor"]
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
        logger.setLevel(numeric_level)

    # Set engineio.server logger to ERROR level to reduce WebSocket logs
    engineio_logger = logging.getLogger("engineio.server")
    for h in engineio_logger.handlers[:]:
        engineio_logger.removeHandler(h)
    engineio_logger.addHandler(console_handler)
    engineio_logger.addHandler(file_handler)
    engineio_logger.addFilter(RequestIdFilter())
    # Add socket error filter to engineio.server logger
    engineio_logger.addFilter(socket_error_filter)
    engineio_logger.propagate = False
    engineio_logger.setLevel(logging.ERROR)

    # Also configure socketio.server logger
    socketio_logger = logging.getLogger("socketio.server")
    for h in socketio_logger.handlers[:]:
        socketio_logger.removeHandler(h)
    socketio_logger.addHandler(console_handler)
    socketio_logger.addHandler(file_handler)
    socketio_logger.addFilter(RequestIdFilter())
    socketio_logger.addFilter(socket_error_filter)
    socketio_logger.propagate = False
    socketio_logger.setLevel(logging.ERROR)

    # Log that logging has been set up
    logging.getLogger("docker_service").info(
        "Logging initialized", extra={"log_level": log_level, "log_file": log_file}
    )


def structured_log(logger, level: str, message: str, **kwargs) -> None:
    """Helper function to create structured log entries with proper context.

    Args:
        logger: The logger instance to use
        level: The log level (debug, info, warning, error, critical)
        message: The log message
        **kwargs: Additional context to include in the log entry
    """
    # Validate log level
    level = level.lower()
    if level not in ["debug", "info", "warning", "error", "critical"]:
        level = "info"  # Default to info for invalid levels

    # Prepare extra context
    extra = {}

    # Organize kwargs into appropriate context categories
    user_context = {}
    operation_context = {}
    system_context = {}
    error_context = {}
    performance_metrics = {}

    # Process kwargs and organize into context categories
    for key, value in kwargs.items():
        if key.startswith("user_"):
            user_context[key[5:]] = value
        elif key.startswith("op_"):
            operation_context[key[3:]] = value
        elif key.startswith("sys_"):
            system_context[key[4:]] = value
        elif key.startswith("err_"):
            error_context[key[4:]] = value
        elif key.startswith("perf_"):
            performance_metrics[key[5:]] = value
        else:
            # Add to extra for fields that don't match a category prefix
            extra[key] = value

    # Update context if new values provided
    if user_context:
        current_user_context = LogContext.get_user_context()
        current_user_context.update(user_context)
        LogContext.set_user_context(**current_user_context)

    if operation_context:
        current_op_context = LogContext.get_operation_context()
        current_op_context.update(operation_context)
        LogContext.set_operation_context(**current_op_context)

    if system_context:
        current_sys_context = LogContext.get_system_context()
        current_sys_context.update(system_context)
        LogContext.set_system_context(**current_sys_context)

    if performance_metrics:
        current_perf_metrics = LogContext.get_performance_metrics()
        current_perf_metrics.update(performance_metrics)
        LogContext.set_performance_metrics(**current_perf_metrics)

    # Add error context if provided
    if error_context:
        extra["error_context"] = error_context

    # Add any remaining kwargs to extra
    if extra:
        log_method = getattr(logger, level)
        log_method(message, extra=extra)
    else:
        log_method = getattr(logger, level)
        log_method(message)


def track_performance(name=None, include_args=False):
    """Decorator to track and log performance metrics for a function.

    Args:
        name: Optional custom name for the operation (defaults to function name)
        include_args: Whether to include function arguments in the log
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Get operation name
            operation_name = name or func.__name__

            # Get logger
            logger = logging.getLogger(func.__module__)

            # Set operation context
            operation_data = {
                "operation_type": "function_call",
                "function": operation_name,
            }

            # Include args if requested (be careful with sensitive data)
            if include_args:
                # Convert args to string representation, limit size
                args_str = (
                    str(args)[:100] + "..." if len(str(args)) > 100 else str(args)
                )
                kwargs_str = (
                    str(kwargs)[:100] + "..." if len(str(kwargs)) > 100 else str(kwargs)
                )
                operation_data["args"] = args_str
                operation_data["kwargs"] = kwargs_str

            LogContext.set_operation_context(**operation_data)

            # Initialize performance metrics
            start_time = time.time()
            LogContext.set_performance_metrics(start_time=start_time)

            # Log start of operation
            structured_log(
                logger, "debug", f"Started {operation_name}", op_name=operation_name
            )

            try:
                # Execute the function
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                # Log error with context
                error_context = LogContext.set_error_context(
                    error=e, function=operation_name
                )
                structured_log(
                    logger,
                    "error",
                    f"Error in {operation_name}",
                    err_exception=str(e),
                    err_type=type(e).__name__,
                )
                raise
            finally:
                # Calculate duration and update metrics
                duration = time.time() - start_time
                LogContext.set_performance_metrics(duration=duration)

                # Log completion
                log_level = (
                    "info" if duration > 0.5 else "debug"
                )  # Log slow operations at INFO level
                structured_log(
                    logger,
                    log_level,
                    f"Completed {operation_name}",
                    perf_duration=duration,
                    perf_slow=(duration > 0.5),
                )

        return wrapper

    return decorator


class ErrorLogger:
    """Context manager for capturing and logging exceptions with proper context."""

    def __init__(
        self, logger, operation_name=None, log_level="error", reraise=True, **context
    ):
        """Initialize the error logger.

        Args:
            logger: The logger instance to use
            operation_name: Name of the operation being performed
            log_level: Log level to use for error messages
            reraise: Whether to re-raise the exception after logging
            **context: Additional context to include in error logs
        """
        self.logger = logger
        self.operation_name = operation_name
        self.log_level = log_level.lower()
        self.reraise = reraise
        self.context = context
        self.start_time = None

    def __enter__(self):
        self.start_time = time.time()
        if self.operation_name:
            # Set operation context if name provided
            LogContext.set_operation_context(
                operation_type="error_logged_operation",
                operation_name=self.operation_name,
            )
            # Update with additional context
            if self.context:
                current_context = LogContext.get_operation_context()
                current_context.update(self.context)
                LogContext.set_operation_context(**current_context)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            # Calculate duration
            duration = time.time() - self.start_time
            LogContext.set_performance_metrics(duration=duration)

            # Create error context
            error_context = LogContext.set_error_context(
                error=exc_val, operation=self.operation_name
            )

            # Add traceback info to error context
            if exc_tb:
                import traceback

                tb_str = "".join(traceback.format_tb(exc_tb))
                error_context["traceback"] = tb_str

            # Log the error with structured logging
            message = (
                f"Error in {self.operation_name}"
                if self.operation_name
                else f"Error: {str(exc_val)}"
            )
            structured_log(
                self.logger,
                self.log_level,
                message,
                err_type=exc_type.__name__,
                err_message=str(exc_val),
                **{f"err_{k}": v for k, v in self.context.items()},
            )

            # Return True to suppress the exception if reraise is False
            return not self.reraise
        return None


def capture_context():
    """Capture the current logging context for later restoration.

    Returns:
        A dictionary containing all current context variables.
    """
    return {
        "request_id": request_id_var.get(),
        "user_context": user_context_var.get(),
        "operation_context": operation_context_var.get(),
        "performance_metrics": performance_metrics_var.get(),
        "system_context": system_context_var.get(),
    }


def restore_context(context_dict):
    """Restore a previously captured logging context.

    Args:
        context_dict: A dictionary containing context variables as returned by capture_context().
    """
    if "request_id" in context_dict:
        request_id_var.set(context_dict["request_id"])

    if "user_context" in context_dict:
        user_context_var.set(context_dict["user_context"])

    if "operation_context" in context_dict:
        operation_context_var.set(context_dict["operation_context"])

    if "performance_metrics" in context_dict:
        performance_metrics_var.set(context_dict["performance_metrics"])

    if "system_context" in context_dict:
        system_context_var.set(context_dict["system_context"])


def with_captured_context(func):
    """Decorator to propagate the current logging context to a function.

    This is particularly useful for maintaining context across thread boundaries,
    such as in background tasks or thread pools.
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        # Capture the current context
        context = capture_context()

        @wraps(func)
        def wrapped_func(*args, **kwargs):
            # Restore the captured context
            restore_context(context)
            return func(*args, **kwargs)

        return wrapped_func(*args, **kwargs)

    return wrapper
