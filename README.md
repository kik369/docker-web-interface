# Docker Web Interface 🐳

## Overview

Docker Web Interface is a comprehensive system for monitoring and managing Docker containers in real-time. It provides a modern, responsive web interface built with React and a robust Flask backend. The platform supports live container log streaming, Docker image management, and Docker Compose project grouping, all while offering enhanced logging and request tracing.

## Key Features

-   **Real-time Container Monitoring**
    -   Receive live updates via WebSocket as container states change.
-   **Modern Web Interface**
    -   Intuitive React-based UI with simplified styling.
-   **RESTful API Backend**
    -   Flask-powered endpoints to manage containers and images.
-   **Live Log Streaming**
    -   View container logs in real-time with persistent state across sessions.
-   **Docker Image Management**
    -   List, search, and view images through the dedicated UI.
    -   Delete images (with force option for images used by containers).
    -   Direct links to Docker Hub or registry source for each image.
-   **Docker Compose Project Grouping**
    -   Automatically group containers by Docker Compose projects and perform bulk actions (start, stop, restart).
-   **Enhanced Logging and Request Tracing**
    -   Comprehensive logging with unique request IDs for improved traceability.
-   **State Persistence**
    -   Maintains active tab selections, group expansion states, and log view settings between sessions.

## Architecture

### System Components

1. **Frontend (React)**

    - Communicates with the backend via REST API and WebSocket.
    - Provides an interactive interface for container and image management.

2. **Backend (Flask)**
    - Offers RESTful API endpoints and a WebSocket server.
    - Integrates with the Docker Engine using the Docker SDK to manage containers and images.
    - Handles log streaming and emits container state changes in real time.

### Architecture Diagram

```mermaid
graph TD
    A[Frontend React] -->|REST API & WebSocket| B[Backend Flask]
    B -->|Docker SDK| C[Docker Engine]
    B -->|Image Management API| D[Docker Registry]
    C -->|Image Operations| D
```

> ℹ️ **Note:** Real-time container metrics updates and resource usage tracking are planned features.

## Installation and Setup

### Prerequisites

-   Docker and Docker Compose installed on your system.
-   Node.js (version 18+) for frontend development.
-   Python (version 3.11) for backend development.

### Quick Start

1. **Clone the Repository:**

    ```bash
    git clone https://github.com/kik369/docker-web-interface.git
    cd docker-web-interface
    ```

2. **Configure Environment Variables:**

    - Copy `.env.example` to `.env`
    - Edit the file to set the following variables as needed:
        - `FLASK_DEBUG` (set to 1 for debug mode, 0 for production)
        - `FLASK_APP` (default: `docker_monitor.py`)
        - `LOG_LEVEL` (e.g., `INFO`, `DEBUG`)
        - `LOG_FORMAT` (`json` or `text`)
        - `PYTHONPATH` (default: `/app`)
        - Other variables as specified in `.env.example`

3. **Build and Run with Docker Compose:**

    ```bash
    docker compose up
    ```

### Local Development Setup

For quicker prototyping and debugging, you can run the components locally outside of Docker.

1. **Start the Frontend:**

    ```bash
    PORT=3002 npm start
    ```

2. **Start the Backend:**

    ```bash
    gunicorn -b 0.0.0.0:5000 -k eventlet --timeout 120 --worker-class eventlet --workers 1 --reload docker_monitor:app
    ```

> 💡 **Tip:** Running the application locally allows for faster feedback and easier debugging. Ensure all dependencies are installed in your local environment.

## To-Do List and Pending Work

-   [ ] Implement real-time container metrics updates
-   [ ] Add container resource usage tracking
-   [ ] Add automated testing
-   [ ] Implement container log search functionality

Completed tasks:

-   [x] Docker image management functionality
-   [x] Image management UI with tab navigation
-   [x] Image deletion with confirmation dialog
-   [x] Docker Hub/registry source links for images
-   [x] Request logging with request ID tracing
-   [x] Persistent tab selection
-   [x] CSS styling optimisation
-   [x] Docker Compose project grouping with bulk actions

## Developer Documentation

-   **Backend:** Built with Flask and Gunicorn. Core modules include:
    -   `docker_monitor.py` – Application setup and WebSocket integration.
    -   `docker_service.py` – Interfacing with Docker Engine for container and image operations.
-   **Frontend:** Developed in React with TypeScript. The UI leverages WebSocket for real-time updates and includes dedicated components for container and image management.
-   **Logging:** Implemented using Python's logging module with custom JSON formatting and request ID tracking, ensuring detailed monitoring and debugging.

## Additional Notes

-   The Docker socket is mounted into the backend container to enable direct communication with the Docker Engine.
-   Future updates will include detailed container metrics and enhanced resource monitoring features.
