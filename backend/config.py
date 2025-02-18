import os


class Config:
    # Flask settings
    FLASK_ENV = os.getenv("FLASK_ENV", "production")
    DEBUG = FLASK_ENV == "development"

    # Docker command settings
    DOCKER_PS_FORMAT = (
        "table {{.ID}}\t{{.Image}}\t{{.Command}}\t{{.CreatedAt}}\t"
        "{{.RunningFor}}\t{{.State}}\t{{.Status}}\t{{.Size}}\t{{.Names}}\t"
        "{{.Mounts}}\t{{.Networks}}\t{{.Ports}}\t{{.Labels}}"
    )

    # Application settings
    REFRESH_INTERVAL = int(os.getenv("REFRESH_INTERVAL", "30"))  # seconds
    MAX_REQUESTS_PER_MINUTE = int(os.getenv("MAX_REQUESTS_PER_MINUTE", "60"))
