# Docker Integration Architecture

## Overview

This document details the Docker integration architecture in the Docker Web Interface application, explaining how the application interfaces with Docker Engine API, manages containers and images, and processes Docker events for real-time updates.

## Core Integration Components

### Docker SDK for Python

The application uses Docker SDK for Python (docker-py) to interact with Docker Engine:

```python
import docker
client = docker.from_env()
```

Primary methods of interaction:

-   Client connection management
-   Container/image operations
-   Event streaming
-   Volume management
-   Network configuration

### Socket Connection

Docker socket mounted into application container:

```yaml
volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
```

Key characteristics:

-   Read-only mount for security
-   Direct access to Docker Engine API
-   No need for TCP/HTTP connection
-   Requires Docker group permissions

## Container Management

### Container Operations

```python
# List containers
docker_containers = self.client.containers.list(all=True)

# Get container by ID
container = self.client.containers.get(container_id)

# Container actions
container.start()
container.stop()
container.restart()
container.remove(force=True)

# Container logs
logs = container.logs(
    stream=False,
    tail=lines,
    timestamps=True,
    follow=False
).decode('utf-8')

# Stream logs
log_generator = container.logs(
    stream=True,
    tail=0,
    timestamps=True,
    follow=True,
    since=since_time
)
```

### Container Data Extraction

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

def _extract_compose_info(self, labels: dict) -> tuple[str, str]:
    # Extract Docker Compose project and service information from container labels
    compose_project = labels.get("com.docker.compose.project")
    compose_service = labels.get("com.docker.compose.service")

    # Fallback extraction from container name if labels not present
    if not compose_project:
        container_name = labels.get("com.docker.compose.container-name", "")
        if container_name:
            parts = container_name.split("_")
            if len(parts) >= 2:
                compose_project = parts[0]
                compose_service = parts[1]

    # Format for display
    if compose_project and compose_project != "Standalone Containers":
        formatted_project = " ".join(
            word.capitalize()
            for word in compose_project.replace("-", " ").replace("_", " ").split()
        )
        compose_project = f"Docker Compose: {formatted_project}"

    return compose_project, compose_service
```

### Port Mapping Extraction

```python
def _format_ports(self, container_info: dict) -> str:
    if not container_info:
        return ""

    ports = []
    port_bindings = container_info.get("HostConfig", {}).get("PortBindings", {})

    for container_port, host_bindings in port_bindings.items():
        if host_bindings:
            for binding in host_bindings:
                host_port = binding.get("HostPort", "")
                if host_port:
                    ports.append(f"{host_port}->{container_port}")

    return ", ".join(ports) if ports else ""
```

## Image Management

### Image Operations

```python
# List images
docker_images = self.client.images.list(all=True)

# Get image by ID
image = self.client.images.get(image_id)

# Delete image
self.client.images.remove(image_id, force=force)

# Pull image
self.client.images.pull(repository, tag)
```

### Image Data Extraction

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

def get_all_images(self) -> Tuple[Optional[List[Image]], Optional[str]]:
    try:
        docker_images = self.client.images.list(all=True)
        images = []

        for docker_image in docker_images:
            image_info = docker_image.attrs
            size_mb = image_info.get("Size", 0) / (1024 * 1024)

            # Parse creation timestamp
            created_str = image_info.get("Created", "")
            created = datetime.strptime(created_str.split(".")[0], "%Y-%m-%dT%H:%M:%S")

            image = Image(
                id=docker_image.id,
                tags=docker_image.tags if docker_image.tags else [],
                size=round(size_mb, 2),
                created=created,
                repo_digests=image_info.get("RepoDigests", []),
                parent_id=image_info.get("Parent", ""),
                labels=image_info.get("Config", {}).get("Labels", {})
            )
            images.append(image)

        return images, None
    except Exception as e:
        return None, f"Failed to get images: {str(e)}"
```

## Event Streaming

### Docker Event Subscription

```python
def start_event_subscription(self):
    """Start subscription to Docker events."""
    if self.event_thread is not None and self.event_thread.is_alive():
        return  # Already running

    self.should_stop_event_subscription = False
    self.event_thread = threading.Thread(
        target=self._monitor_events, daemon=True
    )
    self.event_thread.start()
    logger.info("Docker event subscription started")

def _monitor_events(self):
    """Monitor Docker events and emit container state changes."""
    try:
        events = self.client.events(decode=True)
        for event in events:
            if self.should_stop_event_subscription:
                break

            # Only process container events
            if event.get("Type") == "container":
                try:
                    self._emit_container_state(event)
                except Exception as e:
                    logger.error(f"Error processing container event: {str(e)}")
                    continue

    except Exception as e:
        if not self.should_stop_event_subscription:
            logger.error(f"Docker event subscription error: {str(e)}")
```

### Container State Emission

```python
def _emit_container_state(self, event: dict):
    """Emit container state change to WebSocket clients."""
    if self.socketio is None:
        return  # No socketio instance available

    # Extract container info from event
    container_id = event.get("id")
    if not container_id:
        return  # No container ID, can't do anything

    status = event.get("status")

    # Map Docker event status to application state
    state_mapping = {
        "create": "created",
        "start": "running",
        "restart": "running",
        "die": "stopped",
        "destroy": "deleted",
    }

    state = state_mapping.get(status, status)

    # For deleted containers, emit minimal state
    if state == "deleted":
        self.socketio.emit(
            "container_state_change",
            {
                "container_id": container_id,
                "state": "deleted",
                "status": "removed",
            },
        )
        return

    # For other states, fetch container details
    try:
        container = self.client.containers.get(container_id)
        container_info = container.attrs

        # Extract container metadata
        name = container.name
        state_info = container_info.get("State", {})
        config = container_info.get("Config", {})
        labels = config.get("Labels", {})

        # Determine container state
        computed_state = "running" if state_info.get("Running") else "stopped"

        # Extract Docker Compose information
        compose_project, compose_service = self._extract_compose_info(labels)

        # Format ports for display
        ports = self._format_ports(container_info)

        # Get container image
        image = container.image.tags[0] if container.image.tags else container.image.id

        # Emit state change event
        self.socketio.emit(
            "container_state_change",
            {
                "container_id": container_id,
                "name": name,
                "image": image,
                "status": state_info.get("Status", status),
                "state": computed_state,
                "ports": ports,
                "compose_project": compose_project,
                "compose_service": compose_service,
                "created": container_info.get("Created", ""),
            },
        )
    except docker.errors.NotFound:
        # Container deleted between event and our fetch
        self.socketio.emit(
            "container_state_change",
            {
                "container_id": container_id,
                "state": "deleted",
                "status": "removed",
            },
        )
    except Exception as e:
        logger.error(f"Error emitting container state: {str(e)}")
```

## Container Log Streaming

### Stream Implementation

```python
def stream_container_logs(
    self, container_id: str, since: Optional[int] = None
) -> Optional[Generator[str, None, None]]:
    """Stream container logs as they are generated."""
    try:
        container = self.client.containers.get(container_id)

        kwargs = {
            "stream": True,
            "follow": True,
            "timestamps": True,
        }

        if since is not None:
            kwargs["since"] = since

        log_generator = container.logs(**kwargs)

        def decode_logs():
            for log_line in log_generator:
                try:
                    yield log_line.decode("utf-8")
                except Exception as e:
                    logger.error(f"Error decoding log line: {str(e)}")
                    continue

        return decode_logs()
    except docker.errors.NotFound:
        logger.warning(f"Container {container_id} not found for log streaming")
        return None
    except Exception as e:
        logger.error(f"Error streaming container logs: {str(e)}")
        return None
```

### WebSocket Integration

```python
def stream_logs_background():
    """Background task to stream container logs to the client."""
    try:
        # Get initial logs
        initial_logs, error = self.docker_service.get_container_logs(
            container_id, lines=100
        )

        # Send initial logs to client
        if initial_logs:
            self.socketio.emit(
                "log_update",
                {"container_id": container_id, "log": initial_logs},
                room=sid,
            )

        # Determine timestamp of last log
        if initial_logs:
            log_lines = initial_logs.strip().split("\n")
            if log_lines:
                last_line = log_lines[-1]
                timestamp_match = re.match(
                    r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})",
                    last_line,
                )
                if timestamp_match:
                    timestamp_str = timestamp_match.group(1)
                    last_log_time = int(
                        datetime.strptime(
                            timestamp_str, "%Y-%m-%dT%H:%M:%S"
                        ).timestamp()
                    )

        # Start streaming logs from the timestamp
        log_generator = self.docker_service.stream_container_logs(
            container_id, since=last_log_time
        )

        if log_generator:
            for log_line in log_generator:
                # Check if client still connected or requested stop
                if self.active_streams.get(stream_key, True):
                    break

                # Send log line to client
                self.socketio.emit(
                    "log_update",
                    {"container_id": container_id, "log": log_line},
                    room=sid,
                )
    except Exception as e:
        logger.error(f"Error in log stream: {str(e)}")

    # Clean up when done
    if stream_key in self.active_streams:
        del self.active_streams[stream_key]
```

## Container Rebuild Flow

```python
def rebuild_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
    """Rebuild a container (stop, remove, recreate, start)."""
    try:
        # Get container
        container = self.client.containers.get(container_id)

        # Store container configuration for recreation
        container_info = container.attrs
        config = container_info.get("Config", {})
        host_config = container_info.get("HostConfig", {})
        network_settings = container_info.get("NetworkSettings", {})

        # Get image
        image_tag = config.get("Image")

        # Get container name
        name = container.name

        # Store volume mounts
        volumes = host_config.get("Binds", [])

        # Store port bindings
        port_bindings = host_config.get("PortBindings", {})

        # Store environment variables
        env = config.get("Env", [])

        # Store cmd
        cmd = config.get("Cmd")

        # Store entrypoint
        entrypoint = config.get("Entrypoint")

        # Store working directory
        working_dir = config.get("WorkingDir")

        # Store network mode
        network_mode = host_config.get("NetworkMode")

        # Get networks
        networks = {}
        for network_name, network_config in network_settings.get("Networks", {}).items():
            if network_name != "bridge" or network_mode == "bridge":
                networks[network_name] = {}

        # Stop and remove container
        container.stop()
        container.remove()

        # Pull latest image
        self.client.images.pull(image_tag)

        # Create and start new container
        new_container = self.client.containers.run(
            image=image_tag,
            name=name,
            detach=True,
            volumes=volumes,
            ports=port_bindings,
            environment=env,
            command=cmd,
            entrypoint=entrypoint,
            working_dir=working_dir,
            network_mode=network_mode,
            network=networks if networks else None,
        )

        return True, None
    except docker.errors.NotFound:
        return False, f"Container {container_id} not found"
    except docker.errors.APIError as e:
        return False, f"Docker API error: {str(e)}"
    except Exception as e:
        return False, f"Failed to rebuild container: {str(e)}"
```

## Docker Compose Integration

### Project Detection

```python
def _extract_compose_info(self, labels: dict) -> tuple[str, str]:
    """
    Extract Docker Compose project and service information from container labels.
    Falls back to parsing the container name if labels are not set.
    Returns a formatted project name and service name.
    """
    # Ensure labels is a dictionary
    if labels is None:
        labels = {}

    # Try to get values from the Compose labels.
    compose_project = labels.get("com.docker.compose.project")
    compose_service = labels.get("com.docker.compose.service")

    # If no project label is present, attempt to parse from the container name.
    if not compose_project:
        container_name = labels.get("com.docker.compose.container-name", "")
        if container_name:
            # Docker Compose container names typically follow the pattern: project_service_index
            parts = container_name.split("_")
            if len(parts) >= 2:
                compose_project = parts[0]
                compose_service = parts[1]
            else:
                compose_project = "Standalone Containers"
                compose_service = container_name
        else:
            compose_project = "Standalone Containers"
            compose_service = "unknown"
    else:
        # If project exists but service is missing, try to infer service from container name.
        if not compose_service:
            container_name = labels.get("com.docker.compose.container-name", "")
            if container_name:
                parts = container_name.split("_")
                if len(parts) >= 2:
                    compose_service = parts[1]
                else:
                    compose_service = container_name
            else:
                compose_service = "unknown"

    # Format the project name to be more user-friendly
    if compose_project and compose_project != "Standalone Containers":
        # Convert project name to a more readable format: my-project-name -> My Project Name
        formatted_project = " ".join(
            word.capitalize()
            for word in compose_project.replace("-", " ").replace("_", " ").split()
        )
        compose_project = f"Docker Compose: {formatted_project}"

    return compose_project, compose_service
```

### Group Actions

Frontend implementation of group operations:

```typescript
// Handle group action (start, stop, restart all containers in a group)
const handleGroupAction = async (
    action: 'start' | 'stop' | 'restart',
    projectName: string
) => {
    // Check if this is a Docker Compose project (not standalone containers)
    if (projectName === 'Standalone Containers') return;

    // Get all containers in this project
    const projectContainers = containers.filter(
        c => c.compose_project === projectName
    );

    // Set loading state for all containers in this group
    const containerIds = projectContainers.map(c => c.id);
    setGroupActionStates(prev => ({
        ...prev,
        [projectName]: action,
    }));

    // Execute the action on each container
    try {
        const actionPromises = containerIds.map(id => {
            switch (action) {
                case 'start':
                    return startContainer(id);
                case 'stop':
                    return stopContainer(id);
                case 'restart':
                    return restartContainer(id);
                default:
                    return Promise.resolve();
            }
        });

        await Promise.all(actionPromises);
    } catch (error) {
        console.error(
            `Error performing ${action} on group ${projectName}:`,
            error
        );
    } finally {
        // Clear loading state
        setGroupActionStates(prev => ({
            ...prev,
            [projectName]: null,
        }));
    }
};
```

## Error Handling

### Docker-Specific Errors

```python
try:
    # Docker operation
    result = self.client.containers.get(container_id)
    return result, None
except docker.errors.NotFound:
    return None, f"Container {container_id} not found"
except docker.errors.APIError as e:
    if "is already in use by container" in str(e):
        return None, f"Port is already in use by another container"
    elif "No such container" in str(e):
        return None, f"Container {container_id} not found"
    else:
        return None, f"Docker API error: {str(e)}"
except requests.exceptions.ConnectionError:
    return None, "Cannot connect to Docker daemon"
except Exception as e:
    return None, f"Unexpected error: {str(e)}"
```

### Image Deletion Error Handling

```python
def delete_image(self, image_id: str, force: bool = False) -> Tuple[bool, Optional[str]]:
    """Delete a Docker image."""
    try:
        # Handle different image ID formats
        if not image_id.startswith("sha256:"):
            try:
                prefixed_id = f"sha256:{image_id}"
                self.client.images.get(prefixed_id)
                image_id = prefixed_id
            except docker.errors.ImageNotFound:
                # Try original ID
                self.client.images.get(image_id)

        # Proceed with deletion
        self.client.images.remove(image_id, force=force)
        return True, None
    except docker.errors.ImageNotFound:
        return False, f"Image {image_id} not found"
    except docker.errors.APIError as e:
        # Provide specific error messages for common issues
        if "image is referenced in multiple repositories" in str(e).lower():
            return False, f"Image {image_id} is used in multiple repositories. Use force=true to delete it."
        elif "image has dependent child images" in str(e).lower():
            return False, f"Image {image_id} has dependent child images. Use force=true to delete it."
        elif "image is being used by running container" in str(e).lower():
            return False, f"Image {image_id} is being used by a running container. Stop the container first or use force=true."
        else:
            return False, f"Failed to delete image: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error deleting image: {str(e)}"
```

## Security Considerations

### Docker Socket Access

1. **Read-Only Mount**:

    ```yaml
    volumes:
        - /var/run/docker.sock:/var/run/docker.sock:ro
    ```

2. **Permission Restrictions**:

    - Application runs with limited user permissions
    - No privileged container execution

3. **Input Validation**:

    - All container/image IDs validated before use
    - Command injection prevention

4. **Rate Limiting**:
    - API rate limiting to prevent DoS attacks
    - Configurable via `MAX_REQUESTS_PER_MINUTE`

### Docker Access Control

1. **Controlled Operations**:

    - No network creation/modification
    - No volume creation outside of rebuilds
    - No privileged container access

2. **Limited Scope**:
    - Read-only access where possible
    - Write operations limited to specific container/image actions

## Resource Usage Metrics

### CPU Statistics

```python
def get_container_cpu_stats(self, container_id: str) -> Tuple[Optional[dict], Optional[str]]:
    """Get CPU stats for a specific container."""
    try:
        container = self.client.containers.get(container_id)
        stats = container.stats(stream=False)

        # Calculate CPU percentage
        cpu_delta = stats["cpu_stats"]["cpu_usage"]["total_usage"] - \
                   stats["precpu_stats"]["cpu_usage"]["total_usage"]
        system_delta = stats["cpu_stats"]["system_cpu_usage"] - \
                      stats["precpu_stats"]["system_cpu_usage"]

        if system_delta > 0 and cpu_delta > 0:
            cpu_percent = (cpu_delta / system_delta) * \
                          len(stats["cpu_stats"]["cpu_usage"]["percpu_usage"]) * 100.0
        else:
            cpu_percent = 0.0

        # Return formatted stats
        return {
            "container_id": container_id,
            "cpu_percent": round(cpu_percent, 2),
            "timestamp": datetime.now().isoformat()
        }, None
    except docker.errors.NotFound:
        return None, f"Container {container_id} not found"
    except Exception as e:
        return None, f"Failed to get container CPU stats: {str(e)}"
```

### Database Storage

```python
# Store CPU stats in SQLite database
self.db_cursor.execute(
    "INSERT INTO cpu_stats (container_id, cpu_percent, timestamp) VALUES (?, ?, ?)",
    (container_id, stats["cpu_percent"], stats["timestamp"]),
)
self.db_connection.commit()
```

## Testing Docker Integration

### Mock Docker Client

```python
@pytest.fixture
def mock_docker_client():
    """Create a mock Docker client for testing."""
    mock_client = Mock()

    # Mock container
    mock_container = Mock()
    mock_container.id = "test_container_id"
    mock_container.name = "test_container"
    mock_container.image = Mock()
    mock_container.image.tags = ["test_image:latest"]
    mock_container.status = "running"
    mock_container.attrs = {
        "State": {"Status": "running"},
        "Config": {
            "Labels": {
                "com.docker.compose.project": "test_project",
                "com.docker.compose.service": "test_service",
            }
        },
        "Created": "2023-01-01T00:00:00Z",
        "NetworkSettings": {
            "Ports": {"80/tcp": [{"HostIp": "0.0.0.0", "HostPort": "8080"}]}
        },
        "HostConfig": {
            "PortBindings": {"80/tcp": [{"HostPort": "8080"}]},
        },
    }

    # Mock containers list
    mock_client.containers.list.return_value = [mock_container]
    mock_client.containers.get.return_value = mock_container

    # Mock image
    mock_image = Mock()
    mock_image.id = "test_image_id"
    mock_image.tags = ["test_image:latest"]
    mock_image.attrs = {
        "Created": "2023-01-01T00:00:00Z",
        "Size": 100000000,
        "RepoTags": ["test_image:latest"],
    }

    # Mock images list
    mock_client.images.list.return_value = [mock_image]
    mock_client.images.get.return_value = mock_image

    return mock_client
```

### Unit Testing Docker Service

```python
def test_get_all_containers(self, docker_service, mock_docker_client):
    """Test getting all containers."""
    containers, error = docker_service.get_all_containers()

    # Assertions
    assert error is None
    assert len(containers) == 1
    assert containers[0].id == "test_container_id"
    assert containers[0].name == "test_container"
    assert containers[0].image == "test_image:latest"
    assert containers[0].status == "running"
    assert containers[0].compose_project == "Docker Compose: Test Project"
    assert containers[0].compose_service == "test_service"

def test_container_action(self, docker_service, mock_docker_client):
    """Test container actions (start, stop, restart)."""
    # Test start container
    success, error = docker_service.start_container("test_container_id")
    assert success is True
    assert error is None
    mock_docker_client.containers.get().start.assert_called_once()

    # Test stop container
    success, error = docker_service.stop_container("test_container_id")
    assert success is True
    assert error is None
    mock_docker_client.containers.get().stop.assert_called_once()

    # Test restart container
    success, error = docker_service.restart_container("test_container_id")
    assert success is True
    assert error is None
    mock_docker_client.containers.get().restart.assert_called_once()
```

## Future Enhancements

1. **Docker Compose File Manipulation**

    - Parse and modify docker-compose.yml files
    - Create/update Docker Compose projects

2. **Container Resource Limits**

    - Set/update CPU/memory limits on containers
    - Monitor resource consumption

3. **Image Building**

    - Build Docker images from Dockerfiles
    - Push images to registries

4. **Docker Swarm Integration**

    - Manage Docker Swarm services
    - Monitor Swarm node health

5. **Network Management**
    - Create and configure Docker networks
    - Visualize network connections between containers
