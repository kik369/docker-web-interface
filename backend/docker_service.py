import logging
import subprocess
from typing import Optional, Tuple

from config import Config

logger = logging.getLogger(__name__)


class DockerService:
    @staticmethod
    def get_running_containers() -> Tuple[Optional[str], Optional[str]]:
        """
        Get information about running Docker containers.

        Returns:
            Tuple[Optional[str], Optional[str]]: A tuple containing (output, error)
        """
        try:
            command = f"docker ps --format '{Config.DOCKER_PS_FORMAT}'"
            result = subprocess.run(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=10,  # Add timeout to prevent hanging
            )

            if result.returncode != 0:
                logger.error(f"Docker command failed: {result.stderr}")
                return None, "Failed to fetch container information"

            return result.stdout, None

        except subprocess.TimeoutExpired:
            logger.error("Docker command timed out")
            return None, "Request timed out"
        except Exception as e:
            logger.error(
                f"Unexpected error while fetching container information: {str(e)}"
            )
            return None, "An unexpected error occurred"
