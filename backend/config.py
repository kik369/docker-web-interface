import os
from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass
class Config:
    """Application configuration."""

    # Server settings
    DEBUG: bool = bool(int(os.getenv("DEBUG", "0")))
    PORT: int = int(os.getenv("PORT", "5000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")

    # Docker settings
    DOCKER_PS_FORMAT: str = os.getenv(
        "DOCKER_PS_FORMAT",
        "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.CreatedAt}}\t{{.Ports}}",
    )

    # Rate limiting
    MAX_REQUESTS_PER_MINUTE: int = int(os.getenv("MAX_REQUESTS_PER_MINUTE", "60"))

    # Frontend settings
    REFRESH_INTERVAL: int = int(os.getenv("REFRESH_INTERVAL", "30"))

    # CORS settings
    CORS_ORIGINS: list[str] = field(
        default_factory=lambda: os.getenv("CORS_ORIGINS", "*").split(",")
    )

    @classmethod
    def to_dict(cls) -> Dict[str, Any]:
        """Convert config to dictionary."""
        return {
            key: getattr(cls, key)
            for key in dir(cls)
            if not key.startswith("_") and not callable(getattr(cls, key))
        }

    @classmethod
    def validate(cls) -> None:
        """Validate configuration values."""
        if cls.MAX_REQUESTS_PER_MINUTE < 1:
            raise ValueError("MAX_REQUESTS_PER_MINUTE must be greater than 0")

        if cls.REFRESH_INTERVAL < 1:
            raise ValueError("REFRESH_INTERVAL must be greater than 0")

        if cls.PORT < 1 or cls.PORT > 65535:
            raise ValueError("PORT must be between 1 and 65535")


# Validate configuration on import
Config.validate()
