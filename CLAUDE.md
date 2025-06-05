# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this Docker Web Interface codebase.

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

This is a **production-ready real-time Docker management interface** with a React 18 frontend and Flask backend connected via WebSocket for live updates. The application provides comprehensive Docker container and image management with sophisticated real-time capabilities.

### Technology Stack

#### Backend
- **Flask 2.2.5** with Flask-CORS for REST API
- **Flask-SocketIO 5.5.1** with Eventlet workers for WebSocket support
- **Docker SDK 7.1.0** for Docker Engine integration
- **Gunicorn 23.0.0** as WSGI server with Eventlet workers
- **Python 3.11** runtime with comprehensive type hints

#### Frontend
- **React 18.2.0** with TypeScript 5.7.3
- **Tailwind CSS 3.4.17** for responsive styling
- **Socket.IO Client 4.8.1** for WebSocket communication
- **React Icons 5.5.0** for comprehensive iconography

### Core Architectural Patterns

1. **Real-time Event-Driven Architecture**: `Docker Events → Flask-SocketIO → React Components`
2. **Singleton Pattern**: FlaskApp, DockerService, and WebSocket connections
3. **Context + Custom Hooks**: React Context API with specialized hooks for state management
4. **Performance Optimization**: Log buffering, virtual scrolling, memory management
5. **Dataclass Models**: Strongly typed Container and Image models with proper serialization

### Backend Architecture (`/backend/`)

#### Core Components
- **`docker_monitor.py`** - Main Flask application with singleton pattern
  - 15+ REST endpoints for container/image operations
  - WebSocket integration for real-time updates
  - Rate limiting (1000 requests/minute) with automatic cleanup
  - Comprehensive error handling with structured logging

- **`docker_service.py`** - Docker Engine interface layer
  - Dataclass models for Container and Image with proper typing
  - Real-time Docker event subscription via threaded monitoring
  - Docker Compose project detection and grouping
  - Smart state mapping from Docker events to UI-friendly states
  - Full CRUD operations with resource management

- **`config.py`** - Environment-driven configuration management
  - Built-in validation with sensible defaults
  - Structured logging configuration (JSON/text formats)
  - Flexible CORS and environment handling

- **`logging_utils.py`** - Advanced logging system
  - Context variables for request ID tracking across async operations
  - Structured JSON logging with comprehensive metadata
  - Performance tracking decorators (`@log_request`, `@track_performance`)
  - Rich error context with stack traces

### Frontend Architecture (`/frontend/src/`)

#### Component Structure
```
components/
├── MainApp.tsx              # Application shell with routing
├── ContainerList.tsx        # Grid-based container management
├── ContainerRow.tsx         # Individual container with real-time updates
├── ImageList.tsx           # Image management interface
├── CommandPalette.tsx      # VS Code-style command interface
├── LogContainer.tsx        # Advanced real-time log viewer
└── shared/                 # Reusable components (Tooltip, etc.)

hooks/
├── useWebSocket.ts         # Singleton WebSocket manager
├── useContainers.ts        # Container state management
├── useImages.ts           # Image operations
└── useDockerMaintenance.ts # System pruning operations

context/
├── ContainerContext.tsx    # Global container state with useReducer
└── ThemeContext.tsx       # Dark/light mode with system detection
```

## Key Features and Capabilities

### Real-time WebSocket Architecture
- **Singleton WebSocket Connection**: Single connection shared across components
- **Automatic Reconnection**: Exponential backoff with infinite retry
- **Log Buffering**: 200ms flush delay for optimized streaming performance
- **Event Subscription**: Docker events trigger immediate UI updates
- **Memory Management**: Automatic buffer cleanup and size limiting

### Advanced UI Features

#### Command Palette System (Ctrl+K)
- **VS Code-inspired Interface**: Fuzzy search across containers/images
- **Contextual Actions**: Container-specific operations
- **Keyboard Navigation**: Full keyboard support with shortcuts
- **Docker Maintenance**: Built-in system pruning commands
- **Categorized Commands**: Navigation, Actions, Maintenance

#### Real-time Log Streaming
- **Performance Optimized**: Virtual scrolling with 5000-line cap
- **Interactive Controls**: Pause/resume, auto-scroll, full-screen mode
- **Smart Buffering**: Automatic scroll-to-bottom with manual override
- **Visual Indicators**: Live connection status and stream health
- **Portal Rendering**: Isolated modal for performance

#### Theme System
- **System Integration**: Automatic dark/light mode detection
- **Persistent Preferences**: localStorage-based theme memory
- **Dynamic Switching**: Real-time changes without reload
- **Comprehensive Coverage**: All components support both themes

### Docker Integration

#### Container Management
- **Real-time State Updates**: Live status with color-coded indicators
- **Docker Compose Integration**: Automatic project/service grouping
- **Port Mapping Display**: Visual host→container port relationships
- **Log Streaming**: Per-container real-time log access
- **Bulk Operations**: Multi-container start/stop/restart

#### Image Management
- **Registry Integration**: Direct links to Docker Hub/registries
- **Force Delete**: Remove images used by stopped containers
- **Size Optimization**: Visual size indicators and cleanup suggestions
- **Layer Information**: Detailed image metadata display

#### Maintenance Operations
- **System Pruning**: Comprehensive Docker resource cleanup
- **Granular Control**: Individual resource type pruning
- **Space Reporting**: Disk space reclamation metrics
- **Batch Operations**: Single-command cleanup workflows

## Development Guidelines

### Performance Considerations
- **Memory Management**: All components implement proper cleanup
- **Virtual Scrolling**: Large datasets handled efficiently
- **Debounced Updates**: Search and filter operations optimized
- **Lazy Loading**: Components loaded on-demand
- **Connection Pooling**: Singleton patterns prevent connection leaks

### Testing Strategy
- **Backend**: pytest with comprehensive Docker client mocking
- **Coverage**: Branch coverage tracking with pytest-cov
- **Frontend**: React Testing Library for component integration testing
- **Pre-commit Hooks**: Automated testing with coverage requirements
- **Integration**: Full stack testing with real Docker operations

### Configuration Management
- **Environment Variables**: All settings configurable via `.env`
- **Validation**: Built-in config validation with error reporting
- **Development Mode**: Hot reload with comprehensive logging
- **Production Mode**: Optimized builds with error handling

### Code Organization
- **Singleton Patterns**: Prevent duplicate services and connections
- **Type Safety**: Comprehensive TypeScript coverage
- **Error Boundaries**: React error boundaries for crash prevention
- **Context Isolation**: Separate contexts for different concerns
- **Hook Composition**: Reusable logic through custom hooks

### Debugging and Monitoring
- **Structured Logging**: JSON logs with request ID tracking
- **Performance Metrics**: Built-in timing and resource tracking
- **Error Context**: Rich error information with stack traces
- **WebSocket Health**: Connection monitoring and diagnostics
- **Rate Limiting**: Built-in protection with monitoring

This codebase represents a sophisticated, production-ready Docker management interface that combines real-time capabilities with modern React patterns and robust backend architecture.