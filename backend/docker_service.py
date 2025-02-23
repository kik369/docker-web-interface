import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Generator, List, Optional, Tuple

import docker

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
        except Exception as e:
            logger.error(f"Failed to initialize Docker client: {e}")
            raise

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
        """Emit container state change event via WebSocket."""
        if self.socketio:
            self.socketio.emit(
                "container_state_change", {"container_id": container_id, "state": state}
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
                            created = datetime.fromtimestamp(float(created_str))
                        except (ValueError, TypeError):
                            # Use current time as fallback if all parsing fails
                            logger.warning(
                                f"Could not parse creation time for image {docker_image.id}, using current time"
                            )
                            created = datetime.now()

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
                    "created": datetime.fromtimestamp(layer.get("Created", 0)),
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
