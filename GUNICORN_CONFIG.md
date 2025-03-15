# Gunicorn Configuration

## Overview

This document describes the Gunicorn configuration used in the Docker Web Interface application for serving the Flask backend with optimized logging.

## Key Configuration Parameters

### Server Settings

```python
bind = "0.0.0.0:5000"  # Bind to all interfaces on port 5000
worker_class = "eventlet"  # Use eventlet worker for async support
workers = 1  # Number of worker processes
timeout = 120  # Worker timeout in seconds
keepalive = 5  # Seconds to keep idle connections open
```

### Logging Configuration

```python
accesslog = "-"  # Log to stdout
errorlog = "-"  # Log to stderr
loglevel = "warning"  # Log level for Gunicorn logs
```

## Socket Error Filtering

A custom filter is implemented to suppress common socket-related errors:

```python
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

        # Filter based on logger name for routine socket messages
        if record.name in ["engineio.server", "socketio.server"]:
            if record.getMessage().find("Socket error") != -1:
                return False

        return True
```

This filter is applied to various loggers in the `post_worker_init` function:

```python
def post_worker_init(worker):
    # Add socket error filter to loggers
    socket_filter = SocketErrorFilter()
    logging.getLogger("gunicorn.error").addFilter(socket_filter)
    logging.getLogger("gunicorn.access").addFilter(socket_filter)
    logging.getLogger("engineio.server").addFilter(socket_filter)
    logging.getLogger("socketio.server").addFilter(socket_filter)
    logging.getLogger().addFilter(socket_filter)
```

## Docker Compose Integration

The configuration is referenced in the `docker-compose.yml` file:

```yaml
command: gunicorn -b 0.0.0.0:5000 -k eventlet --timeout 120 --workers 1 --reload --config=gunicorn_config.py docker_monitor:app
```

## Custom Logging Configuration

The configuration includes a custom logging setup using Python's `logconfig_dict`:

```python
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
```
