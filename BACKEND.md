# Backend Architecture

## Overview

This document details the backend architecture of the Docker Web Interface application, a Flask-based RESTful API service that interfaces with the Docker Engine. The backend provides container and image management functionality, real-time event streaming, and log access.

## Architecture Components

### Core Modules

1. **docker_monitor.py**

    - Main Flask application setup
    - API endpoints definition
    - WebSocket handlers configuration
    - Rate limiting implementation
    - Error handling

2. **docker_service.py**

    - Docker SDK integration
    - Container and image operations
    - Event subscription management
    - Data formatting utilities

3. **logging_utils.py**

    - Structured logging configuration
    - Request ID tracking
    - Socket error filtering
    - JSON log formatting

4. **config.py**

    - Environment variable management
    - Application configuration
    - Defaults definition

5. **gunicorn_config.py**
    - Production server configuration
    - Worker settings
    - Logging customization

## Data Models

### Container Model

```python
@dataclass
class Container:
    id: str
    name: str
    image: str
    status: str
    state: str
    created: datetime
    ports: str
    compose_project: Optional[str] = None
    compose_service: Optional[str] = None
```

### Image Model

```python
@dataclass
class Image:
    id: str
    tags: List[str]
    size: int
    created: datetime
    repo_digests: List[str]
    parent_id: str
    labels: dict
```

## API Endpoints

### Container Management

| Endpoint                         | Method | Description                  |
| -------------------------------- | ------ | ---------------------------- |
| `/api/containers`                | GET    | List all containers          |
| `/api/containers/<id>/logs`      | GET    | Get container logs           |
| `/api/containers/<id>/start`     | POST   | Start container              |
| `/api/containers/<id>/stop`      | POST   | Stop container               |
| `/api/containers/<id>/restart`   | POST   | Restart container            |
| `/api/containers/<id>/rebuild`   | POST   | Rebuild container            |
| `/api/containers/<id>/delete`    | POST   | Delete container             |
| `/api/containers/<id>/cpu-stats` | GET    | Get container CPU statistics |

### Image Management

| Endpoint           | Method | Description     |
| ------------------ | ------ | --------------- |
| `/api/images`      | GET    | List all images |
| `/api/images/<id>` | DELETE | Delete image    |

### Metrics and System

| Endpoint                      | Method | Description                  |
| ----------------------------- | ------ | ---------------------------- |
| `/api/resource-usage-metrics` | GET    | Fetch resource usage metrics |
| `/`                           | GET    | API status check             |

## WebSocket Events

### Server-to-Client Events

| Event                    | Data                                        | Description              |
| ------------------------ | ------------------------------------------- | ------------------------ |
| `connection_established` | `{ message: string }`                       | Connection confirmation  |
| `initial_state`          | `{ containers: Container[] }`               | Initial container states |
| `container_state_change` | `Container`                                 | Container state update   |
| `log_update`             | `{ container_id: string, log: string }`     | Container log line       |
| `error`                  | `{ error: string }`                         | Error notification       |
| `log_stream_stopped`     | `{ container_id: string, message: string }` | Stream termination       |

### Client-to-Server Events

| Event              | Data                       | Description                    |
| ------------------ | -------------------------- | ------------------------------ |
| `connect`          | N/A                        | Establish WebSocket connection |
| `disconnect`       | Reason string              | Terminate WebSocket connection |
| `start_log_stream` | `{ container_id: string }` | Request log streaming          |
| `stop_log_stream`  | `{ container_id: string }` | Stop log streaming             |

## Docker Integration

### Docker SDK Usage

The application uses Docker SDK for Python to interact with Docker Engine:

```python
import docker
client = docker.from_env()
```

### Container Operations

```python
# Get all containers
containers = client.containers.list(all=True)

# Start/stop/restart container
container = client.containers.get(container_id)
container.start()
container.stop()
container.restart()

# Get container logs
logs = container.logs(tail=100).decode('utf-8')

# Delete container
container.remove(force=True)
```

### Image Operations

```python
# List images
images = client.images.list(all=True)

# Delete image
client.images.remove(image_id, force=force)
```

### Event Subscription

```python
# Subscribe to Docker events
events = client.events(decode=True)
for event in events:
    # Process container events
    if event.get('Type') == 'container':
        # Handle container state change
        self._emit_container_state(event)
```

## Architectural Patterns

### Singleton Pattern

The Flask application is implemented as a singleton to ensure only one instance exists:

```python
class FlaskApp:
    _instance = None

    def __new__(cls, *args, **kwargs):
        """Ensure only one instance of FlaskApp is created (Singleton pattern)."""
        if cls._instance is None:
            cls._instance = super(FlaskApp, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
```

### Background Tasks

Eventlet is used for non-blocking background tasks:

```python
import eventlet

def stream_logs_background():
    # Background task implementation
    pass

eventlet.spawn(stream_logs_background)
```

### Decorator Pattern

Endpoint decorators for cross-cutting concerns:

```python
@self.app.route("/api/containers", endpoint="list_containers")
@self.rate_limit
@log_request()
def list_containers() -> Response:
    # Endpoint implementation
    pass
```

## Performance Considerations

### Rate Limiting

Rate limiting prevents API abuse:

```python
def rate_limit(self, f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if self.is_rate_limited():
            return self.error_response(
                "Rate limit exceeded, please try again later", 429
            )
        return f(*args, **kwargs)
    return decorated
```

### Connection Pooling

Docker SDK connection pooling for efficient Docker Engine communication.

### Database Integration

SQLite database for resource metrics storage:

```python
self.db_cursor.execute(
    "INSERT INTO cpu_stats (container_id, cpu_percent, timestamp) VALUES (?, ?, ?)",
    (container_id, stats["cpu_percent"], stats["timestamp"]),
)
```

## Error Handling

### Exception Handling

Comprehensive exception handling with appropriate HTTP status codes:

```python
@self.app.errorhandler(Exception)
def handle_error(error: Exception) -> Response:
    if isinstance(error, HTTPException):
        # HTTP exception handling
        status_code = error.code
        description = error.description
    else:
        # Generic exception handling
        status_code = 500
        description = "An unexpected error occurred"

    # Log based on error severity
    if status_code >= 500:
        logger.error(...)
    elif status_code == 404:
        logger.debug(...)
    else:
        logger.warning(...)

    return self.error_response(description, status_code=status_code)
```

### Docker-Specific Error Handling

Special handling for Docker SDK errors:

```python
try:
    container = self.client.containers.get(container_id)
    # Container operations
except docker.errors.NotFound:
    return None, f"Container {container_id} not found"
except docker.errors.APIError as e:
    return None, f"Docker API error: {str(e)}"
except Exception as e:
    return None, f"Unexpected error: {str(e)}"
```

## Logging System

### Structured JSON Logging

```python
class CustomJsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
        }

        # Add request_id if available
        if hasattr(record, "request_id"):
            log_record["request_id"] = record.request_id

        # Add extra fields
        if hasattr(record, "extra"):
            for key, value in record.extra.items():
                log_record[key] = value

        return json.dumps(log_record)
```

### Request Tracking

Unique request ID generation and tracking:

```python
class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = get_request_id()
        return True

def get_request_id():
    if hasattr(g, "request_id"):
        return g.request_id
    return "no-request-id"

def set_request_id():
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    g.request_id = request_id
    return request_id
```

## Security Considerations

### CORS Configuration

```python
CORS(self.app, resources={r"/api/*": {"origins": Config.CORS_ORIGINS}})
```

### Input Validation

Request data validation throughout the API.

### Docker Socket Security

Docker socket mounted as read-only when appropriate.

## Configuration Management

### Environment Variables

```python
class Config:
    DEBUG = os.environ.get("FLASK_DEBUG", "0") == "1"
    HOST = os.environ.get("HOST", "0.0.0.0")
    PORT = int(os.environ.get("PORT", "5000"))
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
    LOG_FORMAT = os.environ.get("LOG_FORMAT", "json")
    MAX_REQUESTS_PER_MINUTE = int(os.environ.get("MAX_REQUESTS_PER_MINUTE", "100"))
```

## Testing Approach

### Unit Tests

```python
def test_get_all_containers(self, docker_service, mock_docker_client):
    # Setup mock
    mock_docker_client.containers.list.return_value = [mock_container]

    # Test function
    containers, error = docker_service.get_all_containers()

    # Assertions
    assert error is None
    assert len(containers) == 1
    assert containers[0].id == "test_container_id"
```

### Mocking

Docker client mocking for consistent tests:

```python
@pytest.fixture
def mock_docker_client():
    """Create a mock Docker client for testing."""
    mock_client = Mock()
    # Setup mock attributes and return values
    return mock_client

@pytest.fixture
def docker_service(mock_docker_client):
    """Create a DockerService instance with a mock client."""
    service = DockerService()
    service.client = mock_docker_client
    return service
```

## Deployment

### Docker Container

Deployed as part of a Docker Compose setup:

```yaml
backend:
    build:
        context: ./backend
        dockerfile: Dockerfile
    volumes:
        - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
        - FLASK_APP=docker_monitor.py
        - FLASK_DEBUG=0
        - LOG_LEVEL=WARNING
        - LOG_FORMAT=json
    ports:
        - '5000:5000'
```

### Gunicorn WSGI Server

Production deployment using Gunicorn:

```bash
gunicorn -b 0.0.0.0:5000 -k eventlet --timeout 120 --workers 1 --config=gunicorn_config.py docker_monitor:app
```

## Future Enhancements

1. **Authentication System**

    - Implement JWT-based authentication
    - Role-based access control

2. **Enhanced Metrics**

    - More comprehensive container metrics
    - Historical data visualization

3. **Docker Swarm Support**

    - Multi-node container management
    - Swarm-specific operations

4. **Caching Layer**
    - Redis integration for caching
    - Reduced Docker API load
