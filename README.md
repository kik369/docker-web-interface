# Docker Web Interface 🐳

## Project Overview 📋

This project is a comprehensive Docker container monitoring and management system that provides a modern web interface for tracking and managing Docker containers in real-time. It combines a React frontend with a Flask backend, featuring built-in logging and monitoring capabilities.

### Key Features

-   Real-time Docker container monitoring
-   Modern React-based web interface with simplified styling
-   RESTful API backend built with Flask
-   Live container log streaming with state persistence
-   Container health monitoring
-   Enhanced request logging and tracing with unique request IDs
-   Persistent UI state across page refreshes:
    -   Active tab selection
    -   Docker Compose application groups
    -   Container log views
    -   Log content updates
-   Docker image management with tab-based navigation
    -   List and search available images
    -   View detailed image information
    -   Pull and remove images
    -   Image tag management
-   Docker Compose project grouping
    -   Group containers by Docker Compose projects
    -   Bulk actions for all containers in a group (start, stop, restart)
    -   Persistent group expansion state

## To-Do List and Pending Work 📝

-   [ ] Implement real-time container metrics updates
-   [ ] Add container resource usage tracking
-   [ ] Optimize backend performance
-   [ ] Add automated testing
-   [ ] Implement container resource limits management
-   [ ] Implement container log search functionality
-   [x] Add Docker image management functionality
-   [x] Implement image management UI with tab navigation
-   [x] Enhance request logging with request ID tracing
-   [x] Implement persistent tab selection
-   [x] Simplify and optimize CSS styling
-   [x] Implement Docker Compose project grouping
-   [x] Add bulk actions for Docker Compose groups

## How the Project Works 🔧

### Architecture Overview

The project consists of two main components:

```mermaid
graph TD
    A[Frontend React] -->|REST API| B[Backend Flask]
    A -->|WebSocket| B
    B -->|Docker SDK| C[Docker Engine]
    B -->|Metrics| D[Container Stats]
    B -->|Image API| E[Docker Registry]
    C -->|Image Ops| E
```

1. **Frontend React**

    - Modern UI built with React
    - Real-time updates using WebSocket
    - Container management interface
    - Docker image management UI with tab navigation
    - Status visualization
    - Docker Compose project grouping

2. **Backend Flask**
    - RESTful API endpoints
    - Docker SDK integration
    - WebSocket server for real-time updates
    - Built-in request logging and monitoring
    - Container metrics collection
    - Docker image management API endpoints

### Component Interaction

The frontend communicates with the backend through REST APIs and WebSocket connections. The backend interfaces with Docker's API to collect container information, manage images, and collect metrics. All operations and requests are comprehensively logged with unique request IDs for enhanced traceability.

The UI maintains state persistence for:

-   Active tab selection across sessions
-   Docker Compose application groups (expanded/collapsed state)
-   Container log views (open/closed state)
-   Log content updates in real-time via WebSocket
-   Image management tab state and filters

This ensures a seamless user experience even after page refreshes or automatic updates.

### Setup Steps

1. Clone the repository:

    ```bash
    git clone <repository-url>
    cd docker-web-interface
    ```

2. Configure environment variables:

    - Copy `.env.example` to `.env`
    - Required environment variables:
        - `FLASK_DEBUG`: Set to 1 for debug mode, 0 for production mode
        - `FLASK_APP`: The main application file (default: docker_monitor.py)
        - `LOG_LEVEL`: Logging level (e.g., INFO, DEBUG)
        - `LOG_FORMAT`: Log format (json or text)
        - `PYTHONPATH`: Python path configuration
        - Other variables as specified in `.env.example`

3. Build and run:
    ```bash
    docker compose up
    ```

### Local Development Setup 💻

For faster prototyping and development, you can run the application components locally outside of Docker containers. This approach can provide quicker feedback during development.

1. Start the Frontend (React):

    ```bash
    PORT=3002 npm start
    ```

2. Start the Backend (Flask):
    ```bash
    gunicorn -b 0.0.0.0:5000 -k eventlet --timeout 120 --worker-class eventlet --workers 1 --reload docker_monitor:app
    ```

> 💡 **Tip:** Running locally allows for faster reload times and easier debugging. Make sure you have all required dependencies installed in your local environment.
