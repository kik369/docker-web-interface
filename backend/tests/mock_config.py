"""Mock config module for testing."""

from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class Config:
    """Application configuration for testing."""

    # Server settings
    DEBUG: bool = False
    PORT: int = 5000
    HOST: str = "0.0.0.0"
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    LOG_FILE: str = "logs/app.log"

    # Docker settings
    DOCKER_PS_FORMAT: str = "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.CreatedAt}}\t{{.Ports}}"

    # Rate limiting
    MAX_REQUESTS_PER_MINUTE: int = 1000

    # Frontend settings
    REFRESH_INTERVAL: int = 30

    # CORS settings
    CORS_ORIGINS = ["*"]

    @classmethod
    def to_dict(cls) -> Dict[str, Any]:
        """Convert config to dictionary."""
        result = {
            key: getattr(cls, key)
            for key in dir(cls)
            if not key.startswith("_") and not callable(getattr(cls, key))
        }
        # Make sure CORS_ORIGINS is included
        result["CORS_ORIGINS"] = cls.CORS_ORIGINS
        return result

    @classmethod
    def validate(cls) -> None:
        """Validate configuration values."""
        pass


# Create a minimal logging config that won't cause issues
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {"format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": "INFO",
            "formatter": "standard",
            "stream": "ext://sys.stdout",
        },
    },
    "loggers": {"": {"level": "INFO", "handlers": ["console"], "propagate": True}},
}
