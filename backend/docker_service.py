import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Generator, List, Optional, Tuple

import docker

try:
    # For Docker environment
    from config import Config
    from logging_utils import get_request_id
except ImportError:
    # For local development
    pass

logger = logging.getLogger(__name__)


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


@dataclass
class Image:
    id: str
    tags: List[str]
    size: int
    created: datetime
    repo_digests: List[str]
    parent_id: str
    labels: dict


class DockerService:
    def __init__(self, socketio=None):
        try:
            self.client = docker.from_env()
            self.socketio = socketio
            self._event_thread = None
            self._stop_event = threading.Event()
            self.request_counts = {}
            self.current_rate_limit = 100  # or whatever limit is appropriate
        except Exception as e:
            logger.error(f"Failed to initialize Docker client: {e}")
            raise

    def get_current_minute(self):
        # Use datetime.now() for a naive local timestamp to match test keys
        return datetime.now().replace(second=0, microsecond=0)

    def cleanup_request_counts(self):
        current_minute = self.get_current_minute()
        # Explicitly delete keys whose age is 2 minutes or more
        for ts in list(self.request_counts.keys()):
            if current_minute - ts >= timedelta(minutes=2):
                del self.request_counts[ts]

    def handle_request(self, request):
        # ...existing code before rate limiting...
        current_minute = self.get_current_minute()
        self.cleanup_request_counts()
        self.request_counts[current_minute] = (
            self.request_counts.get(current_minute, 0) + 1
        )

        if self.request_counts[current_minute] > self.current_rate_limit:
            # Rate limit exceeded: return a 429 response
            return {"message": "Too Many Requests"}, 429

        # ...existing code to process the request and return a response...

    def _format_ports(self, container_info: dict) -> str:
        """Format port mappings from container info."""
        ports = []
        port_bindings = container_info.get("HostConfig", {}).get("PortBindings", {})

        for container_port, host_bindings in port_bindings.items():
            if host_bindings:
                for binding in host_bindings:
                    host_port = binding.get("HostPort", "")
                    if host_port:
                        ports.append(f"{host_port}->{container_port}")

        return ", ".join(ports) if ports else ""

    def _extract_compose_info(self, labels: dict) -> tuple[str, str]:
        """
        Extract Docker Compose project and service information from container labels.
        Falls back to parsing the container name if labels are not set.
        Returns a formatted project name and service name.
        """
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

    def get_all_containers(self) -> Tuple[Optional[List[Container]], Optional[str]]:
        """Get all containers with their details."""
        try:
            docker_containers = self.client.containers.list(all=True)
            containers = []

            for docker_container in docker_containers:
                try:
                    container_info = docker_container.attrs
                    state_info = container_info.get("State", {})
                    config = container_info.get("Config", {})
                    labels = config.get("Labels", {})

                    compose_project, compose_service = self._extract_compose_info(
                        labels
                    )

                    # Determine a more reliable state based on boolean flags
                    if state_info.get("Restarting"):
                        computed_state = "restarting"
                    elif state_info.get("Running"):
                        computed_state = "running"
                    elif state_info.get("Paused"):
                        computed_state = "paused"
                    else:
                        computed_state = "stopped"

                    container = Container(
                        id=docker_container.id,
                        name=docker_container.name,
                        image=docker_container.image.tags[0]
                        if docker_container.image.tags
                        else docker_container.image.id,
                        status=state_info.get(
                            "Status", "unknown"
                        ),  # Keep the detailed status
                        state=computed_state,  # Use the computed binary state
                        created=datetime.strptime(
                            container_info["Created"].split(".")[0], "%Y-%m-%dT%H:%M:%S"
                        ),
                        ports=self._format_ports(container_info),
                        compose_project=compose_project,
                        compose_service=compose_service,
                    )
                    containers.append(container)
                except Exception as e:
                    logger.error(
                        f"Failed to process container {docker_container.id}: {e}"
                    )
                    continue

            return containers, None

        except Exception as e:
            error_msg = f"Failed to get containers: {str(e)}"
            logger.error(error_msg)
            return None, error_msg

    def get_container_logs(
        self, container_id: str, lines: int = 100
    ) -> Tuple[Optional[str], Optional[str]]:
        """Get logs for a specific container."""
        try:
            container = self.client.containers.get(container_id)
            logs = container.logs(tail=lines, timestamps=True).decode("utf-8")
            return logs, None
        except docker.errors.NotFound:
            error_msg = f"Container {container_id} not found"
            logger.error(error_msg)
            return None, error_msg
        except Exception as e:
            error_msg = f"Failed to get container logs: {str(e)}"
            logger.error(error_msg)
            return None, error_msg

    def stream_container_logs(
        self, container_id: str, since: Optional[int] = None
    ) -> Generator[str, None, None]:
        """Stream logs for a specific container."""
        try:
            container = self.client.containers.get(container_id)
            stream = container.logs(
                stream=True, follow=True, timestamps=True, since=since
            )
            for chunk in stream:
                if isinstance(chunk, bytes):
                    yield chunk.decode("utf-8")
        except docker.errors.NotFound:
            error_msg = f"Container {container_id} not found"
            logger.error(error_msg)
            yield f"Error: {error_msg}"
        except Exception as e:
            error_msg = f"Failed to stream container logs: {str(e)}"
            logger.error(error_msg)
            yield f"Error: {error_msg}"

    def _emit_container_state(self, container_id: str, state: str) -> None:
        """
        Emit container state change event via WebSocket with detailed container information.
        This ensures the frontend has all necessary data for immediate UI updates.
        """
        if self.socketio:
            try:
                # Get the container's current information
                container = self.client.containers.get(container_id)
                container_info = container.attrs
                config = container_info.get("Config", {})
                labels = config.get("Labels", {})

                # Extract compose information
                compose_project, compose_service = self._extract_compose_info(labels)

                # Create a detailed container state update
                container_data = {
                    "container_id": container_id,
                    "name": container.name,
                    "image": container.image.tags[0]
                    if container.image.tags
                    else container.image.id,
                    "status": container_info.get("State", {}).get("Status", "unknown"),
                    "state": state,
                    "ports": self._format_ports(container_info),
                    "compose_project": compose_project,
                    "compose_service": compose_service,
                    "created": container_info["Created"].split(".")[0],
                }

                # Emit the detailed state change
                self.socketio.emit("container_state_changed", container_data)
                logger.info(
                    f"Emitted detailed state change for container {container_id}: {state}"
                )

            except docker.errors.NotFound:
                # If container not found (e.g., after deletion), emit basic state change
                self.socketio.emit(
                    "container_state_changed",
                    {
                        "container_id": container_id,
                        "state": "deleted",
                        "status": "deleted",
                    },
                )
                logger.info(
                    f"Container {container_id} not found, emitted deletion state"
                )
            except Exception as e:
                logger.error(f"Error emitting container state: {e}")
                # Fallback to basic state change on error
                self.socketio.emit(
                    "container_state_changed",
                    {"container_id": container_id, "state": state},
                )

    def start_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
        """Start a stopped container."""
        try:
            container = self.client.containers.get(container_id)
            container.start()
            self._emit_container_state(container_id, "running")
            return True, None
        except docker.errors.NotFound:
            error_msg = f"Container {container_id} not found"
            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Failed to start container: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def stop_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
        """Stop a running container."""
        try:
            container = self.client.containers.get(container_id)
            container.stop()
            self._emit_container_state(container_id, "stopped")
            return True, None
        except docker.errors.NotFound:
            error_msg = f"Container {container_id} not found"
            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Failed to stop container: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def restart_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
        """Restart a container."""
        try:
            container = self.client.containers.get(container_id)
            container.restart()
            self._emit_container_state(container_id, "running")
            return True, None
        except docker.errors.NotFound:
            error_msg = f"Container {container_id} not found"
            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Failed to restart container: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def rebuild_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
        """Rebuild and restart a container using its current image."""
        try:
            # Get the container
            container = self.client.containers.get(container_id)
            container_info = container.attrs

            # Extract container configuration
            config = container_info["Config"]
            host_config = container_info["HostConfig"]
            name = container_info["Name"].lstrip("/")
            image = config["Image"]

            # Stop and remove the container
            container.stop()
            self._emit_container_state(container_id, "stopped")
            container.remove()

            # Pull the latest image
            self.client.images.pull(image)

            # Create and start the new container with the same configuration
            new_container = self.client.containers.run(
                image=image,
                name=name,
                detach=True,
                ports=host_config.get("PortBindings"),
                volumes=host_config.get("Binds"),
                environment=config.get("Env"),
                network_mode=host_config.get("NetworkMode", "default"),
                labels=config.get("Labels", {}),
            )
            self._emit_container_state(new_container.id, "running")
            return True, None

        except docker.errors.NotFound:
            error_msg = f"Container {container_id} not found"
            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Failed to rebuild container: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def delete_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
        """Delete a container."""
        try:
            container = self.client.containers.get(container_id)
            container.remove(force=True)
            self._emit_container_state(container_id, "deleted")
            return True, None
        except docker.errors.NotFound:
            error_msg = f"Container {container_id} not found"
            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Failed to delete container: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def format_container_data(self, containers: list[Container]) -> list[dict]:
        """Format container data for API response."""
        return [
            {
                "id": container.id,
                "name": container.name,
                "image": container.image,
                "status": container.status,
                "state": container.state,
                "created": container.created.isoformat(),
                "ports": container.ports,
                "compose_project": container.compose_project,
                "compose_service": container.compose_service,
            }
            for container in containers
        ]

    def get_all_images(self) -> Tuple[Optional[List[Image]], Optional[str]]:
        """Get all Docker images with their details."""
        try:
            logger.info("Fetching all Docker images")
            docker_images = self.client.images.list(all=True)
            images = []

            for docker_image in docker_images:
                try:
                    image_info = docker_image.attrs

                    # Convert size from bytes to MB for better readability
                    size_mb = image_info.get("Size", 0) / (1024 * 1024)

                    # Parse the creation timestamp correctly
                    created_str = image_info.get("Created", "")
                    try:
                        # Try parsing ISO format first
                        created = datetime.strptime(
                            created_str.split(".")[0], "%Y-%m-%dT%H:%M:%S"
                        )
                    except (ValueError, AttributeError):
                        try:
                            # Fallback to timestamp if ISO format fails
                            created = datetime.fromtimestamp(
                                float(created_str), timezone.utc
                            )
                        except (ValueError, TypeError):
                            # Use current time as fallback if all parsing fails
                            logger.warning(
                                f"Could not parse creation time for image {docker_image.id}, using current time"
                            )
                            created = datetime.now(timezone.utc)

                    image = Image(
                        id=docker_image.id,
                        tags=docker_image.tags if docker_image.tags else [],
                        size=round(size_mb, 2),  # Round to 2 decimal places
                        created=created,
                        repo_digests=image_info.get("RepoDigests", []),
                        parent_id=image_info.get("Parent", ""),
                        labels=image_info.get("Config", {}).get("Labels", {})
                        if image_info.get("Config")
                        else {},
                    )
                    images.append(image)
                    logger.debug(
                        f"Processed image: {image.id[:12]} with tags: {image.tags}"
                    )
                except Exception as e:
                    logger.error(f"Failed to process image {docker_image.id}: {e}")
                    continue

            logger.info(f"Successfully fetched {len(images)} Docker images")
            return images, None

        except Exception as e:
            error_msg = f"Failed to get images: {str(e)}"
            logger.error(error_msg)
            return None, error_msg

    def delete_image(
        self, image_id: str, force: bool = False
    ) -> Tuple[bool, Optional[str]]:
        """Delete a Docker image."""
        try:
            logger.info(f"Attempting to delete image: {image_id}")

            # Handle different image ID formats
            # Sometimes the ID comes with 'sha256:' prefix, sometimes without
            try:
                # First, try to normalize the image ID
                if not image_id.startswith("sha256:"):
                    # If no prefix, try both with and without prefix
                    logger.info(
                        "Image ID has no sha256: prefix, trying with prefix first"
                    )
                    try:
                        prefixed_id = f"sha256:{image_id}"
                        self.client.images.get(
                            prefixed_id
                        )  # Check if image exists with prefix
                        image_id = prefixed_id
                        logger.info(f"Found image with prefixed ID: {image_id}")
                    except docker.errors.ImageNotFound:
                        # If not found with prefix, try the original ID
                        logger.info(
                            f"Image not found with prefix, trying original ID: {image_id}"
                        )
                        self.client.images.get(image_id)  # Check if image exists
            except docker.errors.ImageNotFound:
                error_msg = f"Image {image_id} not found"
                logger.error(error_msg)
                return False, error_msg
            except Exception as e:
                logger.warning(
                    f"Error checking image existence: {str(e)}, proceeding with deletion anyway"
                )

            # Proceed with deletion
            logger.info(f"Removing image with ID: {image_id}, force={force}")
            self.client.images.remove(image_id, force=force)
            logger.info(f"Successfully deleted image: {image_id}")
            return True, None
        except docker.errors.ImageNotFound:
            error_msg = f"Image {image_id} not found"
            logger.error(error_msg)
            return False, error_msg
        except docker.errors.APIError as e:
            error_msg = f"Failed to delete image: {str(e)}"
            logger.error(error_msg)

            # Provide more specific error information for common issues
            if "image is referenced in multiple repositories" in str(e).lower():
                error_msg = f"Image {image_id} is used in multiple repositories. Use force=true to delete it."
            elif "image has dependent child images" in str(e).lower():
                error_msg = f"Image {image_id} has dependent child images. Use force=true to delete it."
            elif "image is being used by running container" in str(e).lower():
                error_msg = f"Image {image_id} is being used by a running container. Stop the container first or use force=true."

            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Unexpected error deleting image: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    def get_image_history(
        self, image_id: str
    ) -> Tuple[Optional[List[dict]], Optional[str]]:
        """Get the history of an image showing its layers."""
        try:
            logger.info(f"Fetching history for image: {image_id}")
            image = self.client.images.get(image_id)
            history = image.history()

            # Process and format the history data
            formatted_history = []
            for layer in history:
                formatted_layer = {
                    "created": datetime.fromtimestamp(
                        layer.get("Created", 0), timezone.utc
                    ),
                    "created_by": layer.get("CreatedBy", ""),
                    "size": round(
                        layer.get("Size", 0) / (1024 * 1024), 2
                    ),  # Convert to MB
                    "comment": layer.get("Comment", ""),
                }
                formatted_history.append(formatted_layer)

            logger.info(f"Successfully fetched history for image: {image_id}")
            return formatted_history, None
        except docker.errors.ImageNotFound:
            error_msg = f"Image {image_id} not found"
            logger.error(error_msg)
            return None, error_msg
        except Exception as e:
            error_msg = f"Failed to get image history: {str(e)}"
            logger.error(error_msg)
            return None, error_msg

    def format_image_data(self, images: List[Image]) -> List[dict]:
        """Format image data for API response."""
        return [
            {
                "id": image.id,
                "tags": image.tags,
                "size": image.size,
                "created": image.created.isoformat(),
                "repo_digests": image.repo_digests,
                "parent_id": image.parent_id,
                "labels": image.labels,
            }
            for image in images
        ]

    def subscribe_to_docker_events(self):
        """
        Subscribe to Docker events and emit container state changes via WebSocket.
        This method runs in a separate thread.
        """
        try:
            logger.info("Starting Docker events subscription")
            for event in self.client.events(decode=True):
                if self._stop_event.is_set():
                    break

                # Only process container events
                if event.get("Type") == "container":
                    container_id = event.get("Actor", {}).get("ID")
                    status = event.get("status")

                    if container_id and status:
                        # Map Docker event status to our container states
                        state = self._map_event_to_state(status)
                        logger.info(
                            f"Container event: {container_id} -> {status} (mapped to {state})"
                        )
                        self._emit_container_state(container_id, state)

        except Exception as e:
            logger.error(f"Error in Docker events subscription: {e}")
        finally:
            logger.info("Docker events subscription stopped")

    def _map_event_to_state(self, event_status: str) -> str:
        """Map Docker event status to container state."""
        state_mapping = {
            "create": "created",
            "start": "running",
            "pause": "paused",
            "unpause": "running",
            "stop": "stopped",
            "kill": "stopped",
            "die": "stopped",
            "destroy": "deleted",
            "restart": "running",
        }
        return state_mapping.get(event_status, event_status)

    def _handle_container_event(self, event):
        """Handle a Docker container event."""
        container_id = event.get("Actor", {}).get("ID")
        status = event.get("status")

        if container_id and status:
            state = self._map_event_to_state(status)
            self._emit_container_state(container_id, state)

    def start_event_subscription(self):
        """Start the Docker events subscription in a background thread."""
        if self._event_thread is None or not self._event_thread.is_alive():
            self._stop_event.clear()
            self._event_thread = threading.Thread(
                target=self.subscribe_to_docker_events
            )
            self._event_thread.daemon = True
            self._event_thread.start()
            logger.info("Started Docker events subscription thread")

    def stop_event_subscription(self):
        """Stop the Docker events subscription thread."""
        if self._event_thread and self._event_thread.is_alive():
            self._stop_event.set()
            self._event_thread.join(timeout=5)
            logger.info("Stopped Docker events subscription thread")

    def get_container_cpu_stats(
        self, container_id: str
    ) -> Tuple[Optional[dict], Optional[str]]:
        """Get CPU stats for a specific container."""
        try:
            container = self.client.containers.get(container_id)

            # Container must be running to get stats
            if container.attrs.get("State", {}).get("Status") != "running":
                return {"cpu_percent": 0, "status": "not running"}, None

            # Get stats with stream=False to get a single stats object
            stats = container.stats(stream=False)

            # Calculate CPU percentage
            cpu_delta = stats.get("cpu_stats", {}).get("cpu_usage", {}).get(
                "total_usage", 0
            ) - stats.get("precpu_stats", {}).get("cpu_usage", {}).get("total_usage", 0)
            system_delta = stats.get("cpu_stats", {}).get(
                "system_cpu_usage", 0
            ) - stats.get("precpu_stats", {}).get("system_cpu_usage", 0)
            num_cpus = stats.get("cpu_stats", {}).get("online_cpus", 1)

            # Avoid division by zero
            cpu_percent = 0.0
            if system_delta > 0:
                cpu_percent = (cpu_delta / system_delta) * num_cpus * 100.0

            return {
                "cpu_percent": round(cpu_percent, 2),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }, None
        except docker.errors.NotFound:
            error_msg = f"Container {container_id} not found"
            logger.error(error_msg)
            return None, error_msg
        except Exception as e:
            error_msg = f"Failed to get container stats: {str(e)}"
            logger.error(error_msg)
            return None, error_msg
