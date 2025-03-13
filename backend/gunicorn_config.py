"""
Gunicorn configuration file for the Docker Web Interface application.
"""

import logging
import sys

# Gunicorn config variables
bind = "0.0.0.0:5000"
worker_class = "eventlet"
workers = 1
timeout = 120
keepalive = 5

# Logging configuration
accesslog = "-"  # Log to stdout
errorlog = "-"  # Log to stderr
loglevel = "warning"

# Custom logging configuration
logconfig_dict = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "generic": {
            "format": "%(asctime)s [%(process)d] [%(levelname)s] %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
            "class": "logging.Formatter",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "generic",
            "stream": sys.stdout,
        }
    },
    "loggers": {
        "gunicorn.error": {
            "level": "WARNING",
            "handlers": ["console"],
            "propagate": False,
        },
        "gunicorn.access": {
            "level": "WARNING",
            "handlers": ["console"],
            "propagate": False,
        },
        "engineio.server": {
            "level": "ERROR",
            "handlers": ["console"],
            "propagate": False,
        },
        "socketio.server": {
            "level": "ERROR",
            "handlers": ["console"],
            "propagate": False,
        },
    },
}


# Custom filter to suppress socket errors
class SocketErrorFilter:
    def filter(self, record):
        if hasattr(record, "msg"):
            msg = str(record.msg) if not isinstance(record.msg, str) else record.msg
            msg_lower = msg.lower()

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
            for error in socket_errors:
                if error.lower() in msg_lower:
                    return False

            # Filter based on logger name for routine socket messages
            if record.name in ["engineio.server", "socketio.server", "gunicorn.error"]:
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
                    err in msg_lower for err in ["socket", "transport", "connection"]
                ):
                    return False

        return True


# Apply the filter to gunicorn loggers
def post_worker_init(worker):
    """
    Called just after a worker has been initialized.
    """
    # Add socket error filter to gunicorn loggers
    socket_filter = SocketErrorFilter()

    # Apply filter to all relevant loggers
    loggers_to_filter = [
        "gunicorn.error",
        "gunicorn.access",
        "engineio.server",
        "socketio.server",
        "root",  # root logger
    ]

    for logger_name in loggers_to_filter:
        logger = logging.getLogger(logger_name)
        logger.addFilter(socket_filter)
        # Set appropriate log level for socket.io related loggers
        if logger_name in ["engineio.server", "socketio.server"]:
            logger.setLevel(logging.ERROR)
