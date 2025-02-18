# Docker Web Interface

Web-based Docker container monitoring interface built with Flask and React.

## Project Structure

```
docker_web_interface/
├── backend/          # Flask API
├── frontend/         # React frontend
└── docker-compose.yml
```

## Setup & Run

Build and run with Docker Compose:

For development with watch mode (auto-reload on changes):

```bash
docker compose watch
```

For regular deployment:

```bash
docker compose up --build -d
```

Access the interface:

```
http://localhost:3001
```

## Configuration

Environment variables in `docker-compose.yml`:

-   `FLASK_ENV`: development/production (default: production)
-   `REFRESH_INTERVAL`: auto-refresh interval in seconds (default: 30)
-   `MAX_REQUESTS_PER_MINUTE`: rate limit (default: 60)

## Docker Socket Access

This application requires access to the Docker socket (`/var/run/docker.sock`), which is a Unix socket that serves as the API endpoint for Docker. Here's what this means:

### What is the Docker Socket?

The Docker socket is the primary way Docker daemon communicates with clients (like this application). It's a file on your system that allows programs to interact with Docker, enabling them to:

-   List containers
-   Monitor container states
-   Start/stop containers
-   Access container logs
-   And perform other Docker operations

### Security Considerations

⚠️ **Important**: Granting access to the Docker socket effectively gives root-level access to the host system. Consider the following:

-   Only run this application in trusted environments
-   Ensure proper file permissions on the Docker socket
-   Consider using Docker's API proxy or socket proxy for enhanced security
-   In production environments, consider using Docker's Remote API with TLS encryption

### Required Setup

The application needs the socket mounted as a volume, which is already configured in the `docker-compose.yml`:

```yaml
volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

For manual Docker runs, include the volume mount:

```bash
docker run -v /var/run/docker.sock:/var/run/docker.sock ...
```

### Troubleshooting

If you encounter permission issues:

1. Ensure your user is in the 'docker' group
2. Check socket permissions (default: 660)
3. Verify the socket exists at `/var/run/docker.sock`
