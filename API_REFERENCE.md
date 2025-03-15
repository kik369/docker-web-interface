# API Reference

## Overview

This document provides a detailed reference for the Docker Web Interface API endpoints and WebSocket events. Use this as a guide for interacting with the backend programmatically.

## Base URL

All REST API endpoints are relative to:

```
http://localhost:5000
```

WebSocket connections use:

```
ws://localhost:5000
```

## Authentication

Currently, the API does not implement authentication. All endpoints are accessible without credentials.

## REST API Endpoints

### Container Management

#### List All Containers

```
GET /api/containers
```

**Response**:

```json
{
    "status": "success",
    "data": [
        {
            "id": "9d4f5e2a1b3c",
            "name": "web-server",
            "image": "nginx:latest",
            "status": "running",
            "state": "running",
            "ports": "80/tcp->8080/tcp",
            "compose_project": "Docker Compose: My Project",
            "compose_service": "web",
            "created": "2023-04-15T10:30:45Z"
        }
        // Additional containers...
    ]
}
```

**Error Response**:

```json
{
    "status": "error",
    "error": "Failed to get containers: Docker Engine not responding"
}
```

#### Get Container Logs

```
GET /api/containers/{container_id}/logs
```

**Parameters**:

-   `container_id`: The ID or name of the container

**Query Parameters**:

-   `lines` (optional): Number of lines to fetch (default: 100)

**Response**:

```json
{
    "status": "success",
    "data": {
        "logs": "2023-04-20T15:42:33.000Z stdout Line 1\n2023-04-20T15:42:34.000Z stdout Line 2\n..."
    }
}
```

**Error Response**:

```json
{
    "status": "error",
    "error": "Container not found"
}
```

#### Container Actions

```
POST /api/containers/{container_id}/{action}
```

**Parameters**:

-   `container_id`: The ID or name of the container
-   `action`: One of `start`, `stop`, `restart`, `rebuild`, `delete`

**Response**:

```json
{
    "status": "success",
    "data": {
        "message": "Container {action}ed successfully"
    }
}
```

**Error Response**:

```json
{
    "status": "error",
    "error": "Failed to {action} container: Container not found"
}
```

#### Get Container CPU Statistics

```
GET /api/containers/{container_id}/cpu-stats
```

**Parameters**:

-   `container_id`: The ID or name of the container

**Response**:

```json
{
    "status": "success",
    "data": {
        "stats": {
            "container_id": "9d4f5e2a1b3c",
            "cpu_percent": 1.75,
            "timestamp": "2023-04-20T15:45:30Z"
        }
    }
}
```

**Error Response**:

```json
{
    "status": "error",
    "error": "Failed to get container CPU stats: Container not found"
}
```

### Image Management

#### List All Images

```
GET /api/images
```

**Response**:

```json
{
    "status": "success",
    "data": [
        {
            "id": "sha256:1234567890abcdef",
            "tags": ["nginx:latest", "nginx:1.21"],
            "size": 142.5,
            "created": "2023-03-15T08:30:00Z",
            "repo_digests": ["nginx@sha256:1234567890abcdef"],
            "parent_id": "sha256:fedcba0987654321",
            "labels": {
                "maintainer": "NGINX Docker Maintainers"
            }
        }
        // Additional images...
    ]
}
```

**Error Response**:

```json
{
    "status": "error",
    "error": "Failed to fetch image data"
}
```

#### Delete Image

```
DELETE /api/images/{image_id}
```

**Parameters**:

-   `image_id`: The ID or name of the image

**Query Parameters**:

-   `force` (optional): Force removal even if in use (default: false)

**Response**:

```json
{
    "status": "success",
    "data": {
        "message": "Image deleted successfully"
    }
}
```

**Error Response**:

```json
{
    "status": "error",
    "error": "Image is being used by running container. Stop the container first or use force=true."
}
```

### System Endpoints

#### Get Resource Usage Metrics

```
GET /api/resource-usage-metrics
```

**Response**:

```json
{
    "status": "success",
    "data": {
        "metrics": [
            {
                "id": 1,
                "container_id": "9d4f5e2a1b3c",
                "cpu_percent": 1.75,
                "timestamp": "2023-04-20T15:45:30Z"
            }
            // Additional metrics...
        ]
    }
}
```

**Error Response**:

```json
{
    "status": "error",
    "error": "Failed to fetch resource usage metrics"
}
```

#### API Status Check

```
GET /
```

**Response**:

```json
{
    "status": "success",
    "data": {
        "status": "Docker Web Interface API is running"
    }
}
```

## WebSocket API

### Connection

Connect to the WebSocket endpoint:

```javascript
const socket = io('ws://localhost:5000', {
    transports: ['websocket'],
    reconnection: true,
});
```

### Server-to-Client Events

#### Connection Established

```javascript
socket.on('connection_established', data => {
    console.log(data.message); // "WebSocket connection established"
});
```

#### Initial State

```javascript
socket.on('initial_state', data => {
    const containers = data.containers;
    // Process initial container states
});
```

#### Container State Change

```javascript
socket.on('container_state_change', data => {
    const containerId = data.container_id;
    const state = data.state; // "running", "stopped", "deleted", etc.
    const name = data.name;
    const image = data.image;
    // Process container state change
});
```

#### Log Update

```javascript
socket.on('log_update', data => {
    const containerId = data.container_id;
    const logLine = data.log;
    // Process log line
});
```

#### Error

```javascript
socket.on('error', data => {
    const errorMessage = data.error;
    // Handle error
});
```

#### Log Stream Stopped

```javascript
socket.on('log_stream_stopped', data => {
    const containerId = data.container_id;
    const message = data.message; // "Log stream stopped"
    // Handle stream stop
});
```

### Client-to-Server Events

#### Start Log Stream

```javascript
socket.emit('start_log_stream', {
    container_id: '9d4f5e2a1b3c',
});
```

**Response Event**: `log_update` events will begin streaming

#### Stop Log Stream

```javascript
socket.emit('stop_log_stream', {
    container_id: '9d4f5e2a1b3c',
});
```

**Response Event**: `log_stream_stopped`

## Rate Limiting

The API implements rate limiting to prevent abuse:

-   Default limit: 100 requests per minute per client
-   When exceeded: Returns 429 (Too Many Requests) status code
-   Reset: Rate limits are reset each minute
-   Configuration: `MAX_REQUESTS_PER_MINUTE` environment variable

## Error Handling

### HTTP Status Codes

-   `200 OK`: Successful request
-   `400 Bad Request`: Invalid input
-   `404 Not Found`: Resource not found
-   `429 Too Many Requests`: Rate limit exceeded
-   `500 Internal Server Error`: Server error

### Error Response Format

```json
{
    "status": "error",
    "error": "Detailed error message"
}
```

## Testing the API

### Using cURL

#### List Containers

```bash
curl -X GET http://localhost:5000/api/containers
```

#### Start Container

```bash
curl -X POST http://localhost:5000/api/containers/9d4f5e2a1b3c/start
```

#### Delete Image

```bash
curl -X DELETE http://localhost:5000/api/images/nginx:latest
```

#### Get Logs

```bash
curl -X GET http://localhost:5000/api/containers/9d4f5e2a1b3c/logs?lines=50
```

### Using JavaScript (Fetch API)

```javascript
// List containers
fetch('http://localhost:5000/api/containers')
    .then(response => response.json())
    .then(data => console.log(data))
    .catch(error => console.error('Error:', error));

// Delete image with force
fetch('http://localhost:5000/api/images/nginx:latest?force=true', {
    method: 'DELETE',
})
    .then(response => response.json())
    .then(data => console.log(data))
    .catch(error => console.error('Error:', error));
```

## Implementation Notes

1. **API Result Format**: All API responses follow the pattern:

    ```json
    {
      "status": "success" | "error",
      "data": { ... } | "error": "Error message"
    }
    ```

2. **Docker ID Formats**: The API accepts both short and long Docker IDs:

    - Short: `9d4f5e`
    - Long: `9d4f5e2a1b3c7d8e9f0a1b2c3d4e5f6a7b8c9d0e`
    - Names: `web-server`

3. **WebSocket Connection Persistence**: The WebSocket connection implements reconnection logic and will automatically reconnect if disconnected.

4. **Stateless API**: The REST API is stateless and doesn't require session maintenance.

5. **Content-Type**: All REST API responses use `application/json` content type.
