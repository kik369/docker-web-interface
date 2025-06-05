# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development and Building
```bash
# Start full stack with hot reload
docker compose up --build --watch

# Start in production mode
FLASK_DEBUG=0 docker compose up --build

# Run in detached mode
docker compose up -d --build
```

### Testing
```bash
# Backend tests with coverage
docker compose exec backend pytest -v --cov=backend --cov-report=term

# Frontend tests
docker compose exec frontend npm test

# Run pre-commit hooks
docker compose exec backend pre-commit run --all-files
```

### Application Access
- Frontend: http://localhost:3002
- Backend API: http://localhost:5000/api
- WebSocket: ws://localhost:5000

## Architecture Overview

This is a **real-time Docker management interface** with a React frontend and Flask backend connected via WebSocket for live updates.

### Core Components
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Socket.IO client (port 3002)
- **Backend**: Flask + Flask-SocketIO + Docker SDK + Gunicorn with Eventlet workers (port 5000)
- **Communication**: REST API for operations + WebSocket for real-time updates

### Key Architectural Patterns

1. **Real-time Data Flow**: `Docker Events → Flask-SocketIO → React Components`
2. **Singleton Services**: FlaskApp, DockerService, and WebSocket connections use singleton patterns
3. **Context + Hooks**: React Context API with custom hooks for state management
4. **Event-Driven Updates**: Docker event subscription triggers UI updates without polling

### Backend Structure (`/backend/`)
- `docker_monitor.py` - Flask app setup and WebSocket integration
- `docker_service.py` - Docker SDK interface (containers, images, logs)
- `config.py` - Environment-based configuration with validation
- `logging_utils.py` - Structured JSON logging with request IDs

### Frontend Structure (`/frontend/src/`)
- `components/` - React components with TypeScript
- `hooks/` - Custom hooks (useWebSocket, useContainers, useImages)
- `context/` - React Context for global state (containers, theme)
- `services/` - API client and WebSocket management

## Key Features

### Real-time Capabilities
- **Live container monitoring** via Docker events API
- **Log streaming** with buffered WebSocket transmission (200ms flush delay)
- **State synchronization** between Docker engine and UI

### Advanced UI Features
- **Command Palette** (Ctrl+K) for search and quick actions
- **Keyboard shortcuts** for all major operations
- **Theme persistence** with system preference detection
- **State persistence** for tab selections and user preferences

### Docker Integration
- **Container management** (CRUD operations, logs, Docker Compose grouping)
- **Image management** (list, delete, registry links)
- **Docker socket mounting** (`/var/run/docker.sock`) for direct Docker Engine access

## Development Notes

### WebSocket Architecture
- Uses Flask-SocketIO with Eventlet workers for async handling
- Singleton WebSocket connection with automatic reconnection
- Buffered log streaming to optimize performance
- Proper cleanup and resource management

### Testing Strategy
- **Backend**: pytest with Docker client mocking for isolated tests
- **Coverage**: Branch coverage tracking with pytest-cov
- **Frontend**: React Testing Library for component testing
- **Pre-commit hooks** run pytest automatically

### Configuration
- Environment variables in `.env` for Flask debug mode, logging format, etc.
- Backend config validation in `config.py`
- Frontend config in `src/config.ts`

### Error Handling
- Rate limiting (1000 requests/minute)
- WebSocket reconnection with exponential backoff
- React Error Boundaries for UI crash prevention
- Comprehensive structured logging with request IDs