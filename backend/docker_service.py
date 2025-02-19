import json
import logging
import subprocess
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Protocol, Tuple

logger = logging.getLogger(__name__)


class CommandExecutor(Protocol):
    def execute(self, command: str, timeout: int = 10) -> Tuple[str, Optional[str]]: ...


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

    @classmethod
    def from_docker_output(cls, output_line: str) -> "Container":
        """Create a Container instance from a docker ps output line."""
        try:
            (
                id_,
                name,
                image,
                status,
                state,
                created,
                ports,
                compose_project,
                compose_service,
            ) = output_line.strip().split("\t")

            # Clean up and normalize the state
            state = state.strip().lower()
            if not state:
                state = "unknown"
            elif state == "true":  # Handle boolean string from Docker
                state = "running"
            elif state == "false":
                state = "stopped"

            # Clean up the status
            status = status.strip()

            # Docker's date format is like: "2025-02-18 17:01:46 +0000 UTC"
            # Remove the UTC suffix and parse
            created_str = created.replace(" UTC", "")
            created_dt = datetime.strptime(created_str, "%Y-%m-%d %H:%M:%S %z")

            return cls(
                id=id_,
                name=name,
                image=image,
                state=state,
                status=status,
                created=created_dt,
                ports=ports or "",
                compose_project=compose_project or None,
                compose_service=compose_service or None,
            )
        except ValueError as e:
            logger.error(f"Failed to parse container data: {e}")
            raise ValueError(f"Invalid container data format: {output_line}")


class ShellCommandExecutor:
    def execute(self, command: str, timeout: int = 10) -> Tuple[str, Optional[str]]:
        try:
            result = subprocess.run(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=timeout,
            )

            if result.returncode != 0:
                logger.error(f"Command failed: {result.stderr}")
                return "", result.stderr

            return result.stdout, None

        except subprocess.TimeoutExpired:
            logger.error(f"Command timed out after {timeout} seconds")
            return "", "Command execution timed out"
        except Exception as e:
            logger.error(f"Unexpected error during command execution: {str(e)}")
            return "", f"Command execution failed: {str(e)}"


class DockerService:
    def __init__(self, command_executor: Optional[CommandExecutor] = None):
        self.command_executor = command_executor or ShellCommandExecutor()

    def get_all_containers(self) -> Tuple[Optional[List[Container]], Optional[str]]:
        """Get all containers with their details."""
        try:
            # Get all containers with their full details
            cmd = "docker ps -a --format '{{.ID}}'"
            output, error = self.command_executor.execute(cmd)
            if error:
                return None, error

            containers = []
            container_ids = [cid for cid in output.strip().split("\n") if cid]

            if not container_ids:
                return [], None

            # Get detailed info for all containers at once
            inspect_cmd = f"docker inspect {' '.join(container_ids)}"
            inspect_output, inspect_error = self.command_executor.execute(inspect_cmd)
            if inspect_error:
                logger.error(f"Failed to inspect containers: {inspect_error}")
                return None, inspect_error

            try:
                containers_info = json.loads(inspect_output)
                for container_info in containers_info:
                    try:
                        # Extract labels
                        labels = container_info.get("Config", {}).get("Labels", {})

                        # Get compose project and service from labels
                        compose_project = labels.get("com.docker.compose.project", "")
                        compose_service = labels.get("com.docker.compose.service", "")

                        # Create the container object
                        container = Container(
                            id=container_info["Id"],
                            name=container_info["Name"].lstrip("/"),
                            image=container_info["Config"]["Image"],
                            status=container_info["State"]["Status"],
                            state=container_info["State"]["Status"],
                            created=datetime.strptime(
                                container_info["Created"].split(".")[0],
                                "%Y-%m-%dT%H:%M:%S",
                            ),
                            ports=self._format_ports(container_info),
                            compose_project=compose_project or None,
                            compose_service=compose_service or None,
                        )

                        # Only try to infer project/service if not already set by labels
                        if not compose_project:
                            name = container.name
                            if "docker_web_" in name or name in [
                                "grafana",
                                "prometheus",
                            ]:
                                container.compose_project = "docker_web_interface"
                                if "-" in name:
                                    service_name = name.split("-")[1]
                                    if "_" in service_name:
                                        service_name = service_name.split("_")[0]
                                    container.compose_service = service_name
                                else:
                                    service_name = name.replace("docker_web_", "")
                                    container.compose_service = service_name
                            else:
                                container.compose_project = "Standalone Containers"
                                container.compose_service = name

                        containers.append(container)
                    except Exception as e:
                        logger.error(
                            f"Failed to process container {container_info.get('Id', 'unknown')}: {str(e)}"
                        )
                        continue

            except json.JSONDecodeError as e:
                error_msg = f"Failed to parse container inspection data: {str(e)}"
                logger.error(error_msg)
                return None, error_msg

            return containers, None

        except Exception as e:
            error_msg = f"Failed to get containers: {str(e)}"
            logger.error(error_msg)
            return None, error_msg

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

    def get_container_logs(
        self, container_id: str, lines: int = 100
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Get logs for a specific container.

        Args:
            container_id: The ID or name of the container
            lines: Number of lines to retrieve

        Returns:
            Tuple[Optional[str], Optional[str]]: A tuple containing (logs, error)
        """
        try:
            command = f"docker logs --tail {lines} {container_id}"
            return self.command_executor.execute(command)
        except Exception as e:
            logger.error(f"Failed to get container logs: {str(e)}")
            return None, f"Failed to get container logs: {str(e)}"

    def start_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
        """Start a stopped container."""
        try:
            command = f"docker start {container_id}"
            _, error = self.command_executor.execute(command)
            return error is None, error
        except Exception as e:
            logger.error(f"Failed to start container: {str(e)}")
            return False, f"Failed to start container: {str(e)}"

    def stop_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
        """Stop a running container."""
        try:
            command = f"docker stop {container_id}"
            _, error = self.command_executor.execute(command)
            return error is None, error
        except Exception as e:
            logger.error(f"Failed to stop container: {str(e)}")
            return False, f"Failed to stop container: {str(e)}"

    def restart_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
        """Restart a container."""
        try:
            command = f"docker restart {container_id}"
            _, error = self.command_executor.execute(command)
            return error is None, error
        except Exception as e:
            logger.error(f"Failed to restart container: {str(e)}")
            return False, f"Failed to restart container: {str(e)}"

    def rebuild_container(self, container_id: str) -> Tuple[bool, Optional[str]]:
        """Rebuild and restart a container using its current image."""
        try:
            # Get container info to get the image and name
            command = f"docker inspect {container_id}"
            inspect_output, error = self.command_executor.execute(command)
            if error:
                return False, error

            # Parse the container configuration
            config = json.loads(inspect_output)
            if not config or not isinstance(config, list) or len(config) == 0:
                return False, "Failed to get container configuration"

            container_config = config[0]
            image = container_config["Config"]["Image"]
            name = container_config["Name"].lstrip("/")  # Remove leading slash
            ports = container_config.get("HostConfig", {}).get("PortBindings", {})
            volumes = container_config.get("HostConfig", {}).get("Binds", [])
            env = container_config.get("Config", {}).get("Env", [])
            network_mode = container_config.get("HostConfig", {}).get(
                "NetworkMode", "bridge"
            )

            # Stop and remove the container
            stop_success, stop_error = self.stop_container(container_id)
            if not stop_success:
                return False, stop_error

            command = f"docker rm {container_id}"
            _, error = self.command_executor.execute(command)
            if error:
                return False, error

            # Pull the latest image
            command = f"docker pull {image}"
            _, error = self.command_executor.execute(
                command, timeout=300
            )  # Longer timeout for pull
            if error:
                return False, error

            # Prepare the run command with the original configuration
            run_cmd_parts = [
                "docker run -d",
                f"--name {name}",
                f"--network {network_mode}",
            ]

            # Add port mappings
            for container_port, host_bindings in ports.items():
                if host_bindings and len(host_bindings) > 0:
                    host_port = host_bindings[0].get("HostPort", "")
                    if host_port:
                        run_cmd_parts.append(
                            f"-p {host_port}:{container_port.split('/')[0]}"
                        )

            # Add volume mappings
            for volume in volumes:
                run_cmd_parts.append(f"-v {volume}")

            # Add environment variables
            for env_var in env:
                if "=" in env_var:  # Only add valid env vars
                    run_cmd_parts.append(f"-e {env_var}")

            # Add the image name
            run_cmd_parts.append(image)

            # Create and start the new container
            command = " ".join(run_cmd_parts)
            _, error = self.command_executor.execute(command)
            return error is None, error

        except Exception as e:
            logger.error(f"Failed to rebuild container: {str(e)}")
            return False, f"Failed to rebuild container: {str(e)}"
