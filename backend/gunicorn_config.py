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
        # Filter common socket shutdown errors
        if record.getMessage().find("socket shutdown error") != -1:
            return False
        if record.getMessage().find("Bad file descriptor") != -1:
            return False

        # Filter additional socket-related errors
        if record.getMessage().find("Socket is closed") != -1:
            return False
        if record.getMessage().find("Connection reset by peer") != -1:
            return False
        if record.getMessage().find("Broken pipe") != -1:
            return False
        if record.getMessage().find("Client is gone") != -1:
            return False
        if record.getMessage().find("Client disconnected") != -1:
            return False

        # Filter based on logger name for routine socket messages
        if record.name in ["engineio.server", "socketio.server"]:
            if record.getMessage().find("Socket error") != -1:
                return False
            if record.getMessage().find("Unexpected packet") != -1:
                return False
            if record.getMessage().find("Invalid session") != -1:
                return False

        return True


# Apply the filter to gunicorn loggers
def post_worker_init(worker):
    """
    Called just after a worker has been initialized.
    """
    # Add socket error filter to gunicorn loggers
    socket_filter = SocketErrorFilter()
    logging.getLogger("gunicorn.error").addFilter(socket_filter)
    logging.getLogger("gunicorn.access").addFilter(socket_filter)

    # Also apply to engineio and socketio loggers
    logging.getLogger("engineio.server").addFilter(socket_filter)
    logging.getLogger("socketio.server").addFilter(socket_filter)

    # Apply to root logger to catch propagated errors
    logging.getLogger().addFilter(socket_filter)
