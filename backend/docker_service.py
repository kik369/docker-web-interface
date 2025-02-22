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


class DockerService:
    def __init__(self):
        try:
            self.client = docker.from_env()
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

    def start_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
        """Start a stopped container."""
        try:
            container = self.client.containers.get(container_id)
            container.start()
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
            container.remove()

            # Pull the latest image
            self.client.images.pull(image)

            # Create and start the new container with the same configuration
            self.client.containers.run(
                image=image,
                name=name,
                detach=True,
                ports=host_config.get("PortBindings"),
                volumes=host_config.get("Binds"),
                environment=config.get("Env"),
                network_mode=host_config.get("NetworkMode", "default"),
                labels=config.get("Labels", {}),
            )

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
            container.remove(
                force=True
            )  # force=True will stop the container if it's running
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
