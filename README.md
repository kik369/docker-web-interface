# Docker Web Interface

## Project Overview

This project is a comprehensive Docker container monitoring and management system that provides a modern web interface for tracking and managing Docker containers in real-time. It combines a React frontend with a Flask backend, integrated with Prometheus for metrics collection and Grafana for visualization.

### Key Features

-   Real-time Docker container monitoring
-   Modern React-based web interface
-   Metrics collection and storage with Prometheus
-   Advanced visualization dashboards with Grafana
-   RESTful API backend built with Flask
-   Live container log streaming
-   Container health monitoring
-   Resource usage tracking (CPU, Memory, Network)

## Current Goals & Objectives

-   [ ] Implement real-time container metrics updates
-   [ ] Add container resource usage graphs
-   [ ] Enhance error handling and logging
-   [ ] Implement user authentication system
-   [ ] Add container management features (start, stop, restart)
-   [ ] Create custom Grafana dashboards
-   [ ] Optimize backend performance
-   [ ] Add automated testing

## How the Project Works

### Architecture Overview

The project consists of four main components:

1. **Frontend (React)**

    - Modern UI built with React
    - Real-time updates using WebSocket
    - Container management interface
    - Metrics visualization

2. **Backend (Flask)**

    - RESTful API endpoints
    - Docker SDK integration
    - WebSocket server for real-time updates
    - Metrics collection and forwarding

3. **Prometheus**

    - Time-series database
    - Metrics collection and storage
    - Query interface for metrics data

4. **Grafana**
    - Advanced visualization platform
    - Custom dashboards
    - Metrics exploration
    - Alert management

### Component Interaction

The frontend communicates with the backend through REST APIs and WebSocket connections. The backend interfaces with Docker's API to collect container information and metrics, which are then stored in Prometheus. Grafana pulls data from Prometheus to create visualizations.

## Installation and Setup

### Prerequisites

-   Docker and Docker Compose
-   Node.js (for local development)
-   Python 3.8+ (for local development)

### Setup Steps

1. Clone the repository:

    ```bash
    git clone <repository-url>
    cd docker-web-interface
    ```

2. Create a .env file with required environment variables (see .env.example)

3. Start the application:
    ```bash
    docker compose up --watch
    ```

The application will be available at:

-   Frontend: http://localhost:3002
-   Backend API: http://localhost:5000
-   Grafana: http://localhost:3001
-   Prometheus: http://localhost:9090

## To-Do List and Pending Work

### High Priority

-   [ ] Implement container resource limits management
-   [ ] Add user authentication and authorization
-   [ ] Create comprehensive API documentation

### Medium Priority

-   [ ] Add support for Docker Swarm
-   [ ] Implement container log search functionality
-   [ ] Create backup and restore functionality

### Low Priority

-   [ ] Add dark mode support
-   [ ] Implement container templates
-   [ ] Add support for custom metrics

## Documentation for Developers

### API Endpoints

-   GET /api/containers - List all containers
-   GET /api/containers/{id} - Get container details
-   GET /api/metrics - Get system metrics
-   WS /api/ws - WebSocket endpoint for real-time updates

### Development Guidelines

1. Follow the established code style
2. Write unit tests for new features
3. Update documentation for API changes
4. Use feature branches for development

### Local Development

1. Start backend:

    ```bash
    cd backend
    pip install -r requirements.txt
    flask run
    ```

2. Start frontend:
    ```bash
    cd frontend
    npm install
    npm start
    ```

## Notes and Reminders

-   The application is currently being monitored using `docker compose up --watch`
-   Do not restart services manually as it will interfere with the monitoring process
-   All configuration changes should be made through environment variables
-   Regular backups of Prometheus and Grafana data are recommended
-   Check Grafana dashboards for custom configurations

---

For any questions or issues, please open a GitHub issue or contact the maintainers.
