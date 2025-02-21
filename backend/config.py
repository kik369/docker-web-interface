import logging.config
import os
from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass
class Config:
    """Application configuration."""

    # Server settings
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    PORT: int = int(os.getenv("PORT", "5000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = (
        "json" if os.getenv("LOG_FORMAT", "json").lower() == "json" else "text"
    )
    LOG_FILE: str = os.getenv("LOG_FILE", "logs/app.log")

    # Docker settings
    DOCKER_PS_FORMAT: str = os.getenv(
        "DOCKER_PS_FORMAT",
        "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}\t{{.CreatedAt}}\t{{.Ports}}",
    )

    # Rate limiting
    MAX_REQUESTS_PER_MINUTE: int = int(os.getenv("MAX_REQUESTS_PER_MINUTE", "1000"))

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

# Logging configuration
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(timestamp)s %(level)s %(name)s %(message)s %(pathname)s %(lineno)d %(funcName)s %(process)d %(thread)d %(request_id)s",
        },
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        },
    },
    "filters": {
        "request_id": {
            "()": "logging_utils.RequestIdFilter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json" if Config.LOG_FORMAT == "json" else "standard",
            "filters": ["request_id"],
            "stream": "ext://sys.stdout",
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "formatter": "json" if Config.LOG_FORMAT == "json" else "standard",
            "filters": ["request_id"],
            "filename": Config.LOG_FILE,
            "maxBytes": 10485760,  # 10MB
            "backupCount": 5,
        },
    },
    "root": {
        "level": Config.LOG_LEVEL,
        "handlers": ["console", "file"],
    },
    "loggers": {
        "werkzeug": {
            "level": "INFO",
            "handlers": ["console"],
            "propagate": False,
        },
        "docker_service": {
            "level": Config.LOG_LEVEL,
            "handlers": ["console", "file"],
            "propagate": False,
        },
    },
}

# Initialize logging configuration
os.makedirs(os.path.dirname(Config.LOG_FILE), exist_ok=True)
logging.config.dictConfig(LOGGING_CONFIG)
