FROM python:3.11-slim

# Install dependencies including Docker CLI
RUN apt-get update && apt-get install -y \
    curl \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | tee /etc/apt/trusted.gpg.d/docker.asc \
    && echo "deb [arch=amd64] https://download.docker.com/linux/debian $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli

WORKDIR /app
COPY . /app
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5000

# Use Flask development server when FLASK_ENV is development
CMD if [ "$FLASK_ENV" = "development" ]; then \
    flask run --host=0.0.0.0 --port=5000 --debug; \
    else \
    gunicorn -b 0.0.0.0:5000 docker_monitor:app; \
    fi
