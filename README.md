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

-   **FLASK_ENV**: Set to `development` or `production`. Default is `production`.
-   **REFRESH_INTERVAL**: The interval (in seconds) between automatic container list refreshes. Default: `30`.
-   **MAX_REQUESTS_PER_MINUTE**: Rate limit for API calls. Default: `60`.

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
├── frontend/         # React frontend
├── docker-compose.yml # Docker Compose configuration
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

## Troubleshooting

1. **Permission Issues**: Ensure your user is in the `docker` group and check socket permissions (`/var/run/docker.sock`).
2. **Rate Limits**: The backend is rate-limited at `MAX_REQUESTS_PER_MINUTE` to avoid overload.
