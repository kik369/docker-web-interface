# Gunicorn Configuration

## Overview

This document describes the Gunicorn configuration used in the Docker Web Interface application. Gunicorn (Green Unicorn) is a Python WSGI HTTP Server for UNIX that's being used to serve our Flask application.

## Configuration File

The Gunicorn configuration is defined in `backend/gunicorn_config.py`. This file is referenced in the `docker-compose.yml` file with the `--config=gunicorn_config.py` parameter.

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

## Socket Error Filtering

A custom filter is implemented to suppress common socket-related errors that would otherwise flood the logs:

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
```

This filter is applied to various loggers in the `post_worker_init` function:

```python
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
```

## Integration with Application Logging

The Gunicorn configuration works in conjunction with the application's logging setup defined in `backend/logging_utils.py`. Together, they provide a comprehensive logging system that:

1. Formats logs consistently
2. Filters out noisy socket-related errors
3. Sets appropriate log levels for different components
4. Ensures logs are directed to the right outputs

## Docker Compose Integration

The Gunicorn configuration is referenced in the `docker-compose.yml` file:

```yaml
command: gunicorn -b 0.0.0.0:5000 -k eventlet --timeout 120 --workers 1 --reload --config=gunicorn_config.py docker_monitor:app
```

This ensures that when the Docker container starts, Gunicorn uses our custom configuration.

## Benefits

Using this custom Gunicorn configuration provides several benefits:

1. **Reduced Log Noise**: Filtering out common socket errors prevents log flooding
2. **Consistent Formatting**: All logs follow a consistent format
3. **Appropriate Log Levels**: Different components log at appropriate levels
4. **Improved Debugging**: Important errors are still logged while noise is suppressed

## Troubleshooting

If you need to temporarily increase logging verbosity for debugging:

1. Change the `loglevel` in `gunicorn_config.py` from "warning" to "info" or "debug"
2. Update logger levels in `logconfig_dict` as needed
3. Restart the application with `docker-compose restart backend`

Remember to revert these changes after debugging to prevent log flooding in production.
