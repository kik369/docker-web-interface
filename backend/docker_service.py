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
    created: datetime
    ports: str

    @classmethod
    def from_docker_output(cls, output_line: str) -> "Container":
        """Create a Container instance from a docker ps output line."""
        try:
            id_, name, image, status, created, ports = output_line.strip().split("\t")
            return cls(
                id=id_,
                name=name,
                image=image,
                status=status,
                created=datetime.fromisoformat(created),
                ports=ports,
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

    def get_running_containers(self) -> Tuple[Optional[List[Container]], Optional[str]]:
        """
        Get information about running Docker containers.

        Returns:
            Tuple[Optional[List[Container]], Optional[str]]: A tuple containing (containers, error)
        """
        try:
            command = f"docker ps --format '{Config.DOCKER_PS_FORMAT}'"
            output, error = self.command_executor.execute(command)

            if error:
                return None, error

            if not output.strip():
                return [], None

            containers = []
            for line in output.strip().split("\n"):
                try:
                    container = Container.from_docker_output(line)
                    containers.append(container)
                except ValueError as e:
                    logger.warning(f"Skipping invalid container data: {e}")
                    continue

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
