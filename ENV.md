# Environment Variables Documentation

This document describes all environment variables used in the Docker Web Interface application. To configure the application, create a `.env` file in the root directory with the following variables.

## Backend Configuration

### Flask Settings

-   `FLASK_ENV`: The Flask environment mode
    -   Values: `development` or `production`
    -   Default: `development`
-   `FLASK_APP`: The main Flask application file
    -   Default: `docker_monitor.py`

### Logging Configuration

-   `LOG_LEVEL`: The logging level for the backend
    -   Values: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
    -   Default: `INFO`
-   `LOG_FORMAT`: The format of log output
    -   Values: `json` or `text`
    -   Default: `json`
-   `PYTHONPATH`: Python path configuration
    -   Default: `/app`

## Frontend Configuration

-   `REACT_APP_API_URL`: The URL where the backend API is accessible
    -   Default: `http://localhost:5000`
-   `REACT_APP_LOG_LEVEL`: Frontend logging level
    -   Values: `debug`, `info`, `warn`, `error`
    -   Default: `info`
-   `REACT_APP_SEND_LOGS_TO_BACKEND`: Whether to forward frontend logs to backend
    -   Values: `true` or `false`
    -   Default: `true`

## Grafana Configuration

-   `GF_SECURITY_ADMIN_PASSWORD`: Admin password for Grafana
    -   Default: `admin`
-   `GF_USERS_ALLOW_SIGN_UP`: Whether to allow user registration
    -   Values: `true` or `false`
    -   Default: `false`

## Prometheus Configuration

-   `PROMETHEUS_CONFIG_FILE`: Path to Prometheus configuration file
    -   Default: `/etc/prometheus/prometheus.yml`
-   `PROMETHEUS_STORAGE_PATH`: Path for Prometheus data storage
    -   Default: `/prometheus`
-   `PROMETHEUS_CONSOLE_LIBRARIES`: Path to console libraries
    -   Default: `/usr/share/prometheus/console_libraries`
-   `PROMETHEUS_CONSOLE_TEMPLATES`: Path to console templates
    -   Default: `/usr/share/prometheus/consoles`

## Example .env File

```env
# Flask Environment
FLASK_ENV=development
FLASK_APP=docker_monitor.py

# Log settings
LOG_LEVEL=INFO
LOG_FORMAT=json
PYTHONPATH=/app

# Frontend settings
REACT_APP_API_URL=http://localhost:5000
REACT_APP_LOG_LEVEL=info
REACT_APP_SEND_LOGS_TO_BACKEND=true

# Grafana settings
GF_SECURITY_ADMIN_PASSWORD=admin
GF_USERS_ALLOW_SIGN_UP=false

# Prometheus settings
PROMETHEUS_CONFIG_FILE=/etc/prometheus/prometheus.yml
PROMETHEUS_STORAGE_PATH=/prometheus
PROMETHEUS_CONSOLE_LIBRARIES=/usr/share/prometheus/console_libraries
PROMETHEUS_CONSOLE_TEMPLATES=/usr/share/prometheus/consoles
```

## Security Notes

1. Never commit the `.env` file to version control
2. Keep your `.env` file secure and restrict access to authorized personnel only
3. Use different values for sensitive variables in production
4. Regularly rotate sensitive credentials like passwords and API keys
