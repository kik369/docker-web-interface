FROM python:3.11-slim

# Set the working directory
WORKDIR /app

# Create log directory
RUN mkdir -p /app/logs

# Copy requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Install the package in development mode
RUN pip install -e .

EXPOSE 5000

# The CMD will be provided by docker-compose.yml
CMD ["gunicorn", "-b", "0.0.0.0:5000", "docker_monitor:app"]
