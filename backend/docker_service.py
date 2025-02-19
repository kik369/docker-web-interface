import json
import logging
import subprocess
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Protocol, Tuple

from config import Config

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

    @classmethod
    def from_docker_output(cls, output_line: str) -> "Container":
        """Create a Container instance from a docker ps output line."""
        try:
            id_, name, image, status, state, created, ports = output_line.strip().split(
                "\t"
            )

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
        """
        Get information about all Docker containers (both running and stopped).

        Returns:
            Tuple[Optional[List[Container]], Optional[str]]: A tuple containing (containers, error)
        """
        try:
            # Using docker ps -a to show all containers and --no-trunc to show full output
            command = f"docker ps -a --no-trunc --format '{Config.DOCKER_PS_FORMAT}'"
            logger.info(f"Executing command: {command}")
            output, error = self.command_executor.execute(command)

            if error:
                logger.error(f"Command error: {error}")
                return None, error

            logger.info(f"Raw docker output:\n{output}")

            if not output.strip():
                logger.info("No containers found")
                return [], None

            containers = []
            for line in output.strip().split("\n"):
                try:
                    logger.debug(f"Processing container line: {line}")
                    fields = line.strip().split("\t")
                    logger.info(f"Split fields: {fields}")
                    if len(fields) != 7:
                        logger.warning(
                            f"Expected 7 fields, got {len(fields)}: {fields}"
                        )
                        continue
                    container = Container.from_docker_output(line)
                    logger.info(f"Created container object: {container}")
                    containers.append(container)
                except ValueError as e:
                    logger.warning(f"Skipping invalid container data: {e}")
                    continue

            logger.info(f"Found {len(containers)} containers")
            return containers, None

        except Exception as e:
            logger.error(f"Failed to get container information: {str(e)}")
            return None, f"Failed to get container information: {str(e)}"

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
