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

## Note

Requires Docker socket access (`/var/run/docker.sock`)
