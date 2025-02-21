# Docker Web Interface

A web-based interface for monitoring Docker containers, built with Flask and React.

## Project Overview

This project provides a Docker container management interface through a Flask API and a React frontend. It allows users to view, manage, and interact with running containers. Key features include:

-   View running containers
-   Start, stop, restart, or rebuild containers
-   View logs for each container
-   Refresh container list automatically
-   Rate-limited API calls to prevent overloading

## Architecture

-   **Backend**: Flask API that communicates with Docker to fetch container data and manage container states.
-   **Frontend**: React application displaying container data and providing controls for container management.
-   **Docker**: Used for containerization and handling environment-specific configurations.

## Backend Functionalities

The backend is built using Flask and provides the following functionalities:

-   Fetch all containers and their details
-   Fetch logs for a specific container
-   Perform actions on containers (start, stop, restart, rebuild)
-   Rate limiting to prevent excessive API calls
-   Logging and monitoring using Prometheus and Grafana

## Frontend Functionalities

The frontend is built using React and provides the following functionalities:

-   Display a list of Docker containers with their details
-   Search and filter containers
-   Perform actions on containers (start, stop, restart, rebuild) through buttons
-   View logs for each container
-   Auto-refresh the container list based on the configured interval
-   Settings to configure refresh interval and rate limit

## Setup

To set up the project with Docker Compose:

1. Clone this repository.
2. Run the following command to build and start containers:

    ```bash
    docker compose up --build -d
    ```

3. Access the interface at [http://localhost:3001](http://localhost:3001).

### Development

For development with auto-reload:

```bash
docker compose up --watch
```

This will start the app in development mode, auto-reloading the backend and frontend on changes.

## Environment Variables

The following environment variables are used in the project:

-   **FLASK_ENV**: Set to `development` or `production`. Default is `production`.
-   **REFRESH_INTERVAL**: The interval (in seconds) between automatic container list refreshes. Default: `30`.
-   **MAX_REQUESTS_PER_MINUTE**: Rate limit for API calls. Default: `60`.
-   **LOG_LEVEL**: The logging level for the backend. Default: `INFO`.
-   **LOG_FORMAT**: The format of log output. Default: `json`.
-   **PYTHONPATH**: Python path configuration. Default: `/app`.
-   **REACT_APP_API_URL**: The URL where the backend API is accessible. Default: `http://localhost:5000`.
-   **REACT_APP_LOG_LEVEL**: Frontend logging level. Default: `info`.
-   **REACT_APP_SEND_LOGS_TO_BACKEND**: Whether to forward frontend logs to backend. Default: `true`.
-   **GF_SECURITY_ADMIN_PASSWORD**: Admin password for Grafana. Default: `admin`.
-   **GF_USERS_ALLOW_SIGN_UP**: Whether to allow user registration. Default: `false`.
-   **PROMETHEUS_CONFIG_FILE**: Path to Prometheus configuration file. Default: `/etc/prometheus/prometheus.yml`.
-   **PROMETHEUS_STORAGE_PATH**: Path for Prometheus data storage. Default: `/prometheus`.
-   **PROMETHEUS_CONSOLE_LIBRARIES**: Path to console libraries. Default: `/usr/share/prometheus/console_libraries`.
-   **PROMETHEUS_CONSOLE_TEMPLATES**: Path to console templates. Default: `/usr/share/prometheus/consoles`.

For detailed environment variable documentation, refer to the `ENV.md` file.

## Docker Socket Access

This project requires Docker socket access (`/var/run/docker.sock`) to interact with the Docker daemon. The socket is mounted in the `docker-compose.yml`:

```yaml
volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

Ensure proper security and permissions when using this in production.

## File Structure

```
docker_web_interface/
├── backend/          # Flask API
│   ├── __init__.py   # Backend package initialization
│   ├── config.py     # Configuration settings
│   ├── docker_monitor.py # Main Flask application
│   ├── docker_service.py # Docker service for container management
│   ├── logging_utils.py  # Logging utilities
│   ├── requirements.txt  # Backend dependencies
│   ├── setup.py      # Backend setup script
├── frontend/         # React frontend
│   ├── public/       # Public assets
│   ├── src/          # Source code
│   ├── Dockerfile    # Frontend Dockerfile
│   ├── package.json  # Frontend dependencies
│   ├── tsconfig.json # TypeScript configuration
├── docker-compose.yml # Docker Compose configuration
├── ENV.md            # Environment variables documentation
```

## Features

-   **Backend**:

    -   `/api/containers`: Fetch all containers
    -   `/api/containers/{id}/logs`: Fetch logs for a specific container
    -   `/api/containers/{id}/{action}`: Manage container actions (`start`, `stop`, `restart`, `rebuild`)

-   **Frontend**:
    -   Displays container list, allows searching and filtering
    -   Provides buttons for container actions (start, stop, restart, rebuild)
    -   Auto-refreshes the container list based on the configured interval

## Security Considerations

-   **Docker Socket Access**: Granting access to the Docker socket provides root-level access to the system. Ensure the environment is trusted, and consider using Docker's Remote API for production.
-   **Environment Variables**: Never commit the `.env` file to version control. Keep your `.env` file secure and restrict access to authorized personnel only. Use different values for sensitive variables in production. Regularly rotate sensitive credentials like passwords and API keys.

## Troubleshooting

1. **Permission Issues**: Ensure your user is in the `docker` group and check socket permissions (`/var/run/docker.sock`).
2. **Rate Limits**: The backend is rate-limited at `MAX_REQUESTS_PER_MINUTE` to avoid overload.
