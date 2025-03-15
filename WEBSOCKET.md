# WebSocket Architecture

## Overview

This document details the WebSocket implementation in the Docker Web Interface application. WebSockets provide real-time, bidirectional communication between the server and clients, enabling live updates of container states, streaming container logs, and real-time notification of Docker events.

## Core Components

### Backend Implementation

The WebSocket server is implemented using Socket.IO with Flask-SocketIO:

```python
from flask_socketio import SocketIO, emit

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Socket.IO event handlers and emitters are integrated throughout the application
```

The server maintains active connections and manages subscription-based data streaming to clients.

### Frontend Implementation

The frontend uses a custom React hook with the Socket.IO client library:

```typescript
// Singleton socket management pattern
let globalSocket: Socket | null = null;
let activeSubscriptions = 0;
let isInitializing = false;
let globalHandlers: Set<UseWebSocketProps> = new Set();

export function useWebSocket({
    onLogUpdate,
    onContainerStateChange,
    onInitialState,
    onError,
    enabled = true,
}: UseWebSocketProps) {
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        if (!enabled) return;

        // Initialize socket connection if not existing
        if (!globalSocket && !isInitializing) {
            isInitializing = true;

            const socketInstance = io(config.API_URL, {
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 60000,
            });

            socketInstance.on('connect', () => {
                setConnected(true);
            });

            socketInstance.on('disconnect', () => {
                setConnected(false);
            });

            globalSocket = socketInstance;
        }

        // Increment active subscription count
        activeSubscriptions++;

        // Add handlers to global set
        globalHandlers.add({
            onLogUpdate,
            onContainerStateChange,
            onInitialState,
            onError,
        });

        return () => {
            // Decrement and cleanup when component unmounts
            activeSubscriptions--;
            globalHandlers.delete({
                onLogUpdate,
                onContainerStateChange,
                onInitialState,
                onError,
            });

            if (activeSubscriptions === 0 && globalSocket) {
                globalSocket.disconnect();
                globalSocket = null;
                isInitializing = false;
            }
        };
    }, [enabled, onLogUpdate, onContainerStateChange, onInitialState, onError]);

    // Additional methods and handlers...

    return {
        connected,
        startLogStream,
        stopLogStream,
    };
}
```

## Communication Flow

1. **Connection Initialization**:

    - Frontend establishes WebSocket connection to backend
    - Backend assigns unique request ID
    - Connection acknowledgment sent to client
    - Initial container states sent immediately after connection

2. **Event Subscription**:

    - Backend subscribes to Docker events
    - Docker events trigger WebSocket emissions
    - Frontend receives real-time updates without polling

3. **Log Streaming**:
    - Client requests log stream for specific container
    - Backend spawns background task using Eventlet/Gevent
    - Logs streamed in real-time to client
    - Buffer system prevents flooding frontend with updates

## Event Types

### Server-to-Client Events

| Event                    | Description                              | Data Format                                 |
| ------------------------ | ---------------------------------------- | ------------------------------------------- |
| `connection_established` | Confirms successful WebSocket connection | `{ message: string }`                       |
| `initial_state`          | Provides all current container states    | `{ containers: Container[] }`               |
| `container_state_change` | Notifies of container state transitions  | `Container`                                 |
| `log_update`             | Streams container logs                   | `{ container_id: string, log: string }`     |
| `error`                  | Communicates error conditions            | `{ error: string }`                         |
| `log_stream_stopped`     | Notifies when a log stream ends          | `{ container_id: string, message: string }` |

### Client-to-Server Events

| Event              | Description                                | Data Format                |
| ------------------ | ------------------------------------------ | -------------------------- |
| `connect`          | Establishes WebSocket connection           | N/A                        |
| `disconnect`       | Terminates WebSocket connection            | N/A                        |
| `start_log_stream` | Requests to begin streaming container logs | `{ container_id: string }` |
| `stop_log_stream`  | Requests to stop streaming container logs  | `{ container_id: string }` |

## Real-Time Container State Updates

The application monitors Docker events and pushes state changes to connected clients:

```python
def monitor_events():
    """Monitor Docker events and emit container state changes to WebSocket clients."""
    for event in docker_client.events(decode=True, filters={'type': 'container'}):
        try:
            container_id = event['id']
            status = event['status']  # created, started, killed, etc.

            if status in ['start', 'stop', 'die', 'kill', 'destroy', 'remove']:
                # Get updated container info if available
                try:
                    container = docker_client.containers.get(container_id)
                    container_data = extract_container_data(container)
                    socketio.emit('container_state_change', container_data)
                except NotFound:
                    # Container was removed, notify clients
                    socketio.emit('container_state_change', {
                        'container_id': container_id,
                        'state': 'removed'
                    })
        except Exception as e:
            logger.error(f"Error handling Docker event: {str(e)}")
```

## Log Streaming Architecture

### Starting a Log Stream

```python
@socketio.on('start_log_stream')
def handle_start_log_stream(data):
    """Start streaming logs for a specific container."""
    container_id = data.get('container_id')
    if not container_id:
        emit('error', {'error': 'No container ID provided'})
        return

    try:
        container = docker_client.containers.get(container_id)

        # Store client session ID with container ID for cleanup
        client_id = request.sid
        if client_id not in active_log_streams:
            active_log_streams[client_id] = set()
        active_log_streams[client_id].add(container_id)

        # Start log streaming in a background thread
        def stream_logs():
            try:
                for log in container.logs(stream=True, follow=True, timestamps=True):
                    log_line = log.decode('utf-8').strip()
                    emit('log_update', {
                        'container_id': container_id,
                        'log': log_line
                    })
                    # Check if client still connected or requested stop
                    if client_id not in active_log_streams or container_id not in active_log_streams[client_id]:
                        break
            except Exception as e:
                emit('error', {'error': f'Log streaming error: {str(e)}'})
            finally:
                # Notify client that log stream has ended
                emit('log_stream_stopped', {
                    'container_id': container_id,
                    'message': 'Log stream stopped'
                })
                # Remove from active streams
                if client_id in active_log_streams and container_id in active_log_streams[client_id]:
                    active_log_streams[client_id].remove(container_id)

        # Start background thread for this log stream
        Thread(target=stream_logs).start()

    except NotFound:
        emit('error', {'error': f'Container {container_id} not found'})
    except Exception as e:
        emit('error', {'error': f'Failed to start log stream: {str(e)}'})
```

### Frontend Log Buffer System

The frontend implements a buffering system to optimize log streaming performance:

```typescript
// Log buffering to prevent excessive re-renders
const logBuffers = new Map<string, string>();
const pendingFlushes = new Set<string>();

// Handle log updates with buffering
globalSocket.on('log_update', (data: { container_id: string; log: string }) => {
    const containerId = data.container_id;
    const logBuffer = logBuffers.get(containerId) || '';
    const newBuffer = logBuffer + data.log + '\n';
    logBuffers.set(containerId, newBuffer);

    // Flush buffer after delay
    if (!pendingFlushes.has(containerId)) {
        pendingFlushes.add(containerId);
        setTimeout(() => {
            pendingFlushes.delete(containerId);
            const bufferToFlush = logBuffers.get(containerId) || '';
            if (bufferToFlush) {
                logBuffers.set(containerId, '');
                // Notify all handlers that need this log update
                globalHandlers.forEach(handler => {
                    if (handler.onLogUpdate) {
                        handler.onLogUpdate(containerId, bufferToFlush);
                    }
                });
            }
        }, 20);
    }
});
```

## Connection Management

### Reconnection Strategy

The WebSocket implementation includes robust reconnection logic:

```typescript
// Client-side reconnection configuration
const socket = io(config.API_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 60000,
});
```

### Cleanup on Disconnect

```python
@socketio.on('disconnect')
def handle_disconnect():
    """Clean up resources when a client disconnects."""
    client_id = request.sid
    if client_id in active_log_streams:
        # No need to send notifications since client is disconnected
        del active_log_streams[client_id]
```

## Error Handling

### Socket Error Filtering

Custom error filtering to suppress common socket errors:

```python
class SocketErrorFilter:
    def filter(self, record):
        # Filter common socket shutdown errors
        if record.getMessage().find("socket shutdown error") != -1:
            return False
        if record.getMessage().find("Bad file descriptor") != -1:
            return False
        # Additional error patterns...
        return True
```

### Client-side Error Handling

```typescript
// Client-side error handling
socket.on('error', data => {
    console.error('WebSocket error:', data.error);
    // Display error notification to user
    showNotification({
        type: 'error',
        message: data.error,
    });
});
```

## Performance Considerations

1. **Connection Pooling**: Efficient handling of concurrent connections through Eventlet/Gevent async modes
2. **Log Buffering**: Frontend buffers log updates to reduce UI re-renders
3. **Singleton Pattern**: Frontend uses a singleton socket connection to prevent redundant connections
4. **Resource Management**: Active tracking of streaming connections with proper cleanup

## Security Considerations

### Cross-Origin Resource Sharing (CORS)

The WebSocket server is configured with CORS settings to control access:

```python
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')
```

In production environments, this should be restricted to specific allowed origins:

```python
# Production configuration with specific origins
socketio = SocketIO(app, cors_allowed_origins=["https://yourdomain.com"], async_mode='eventlet')
```

### Future Authentication (Planned)

```python
@socketio.on('connect')
def handle_connect():
    # Example authentication check
    auth_token = request.args.get('token')
    if not validate_token(auth_token):
        # Reject connection
        return False
    return True
```

## Future Enhancements

1. **Authentication**: Add token-based authentication for WebSocket connections
2. **Subscription Management**: Allow clients to subscribe to specific container events
3. **Message Compression**: Implement data compression for high-volume log streams
4. **Broadcast Optimization**: Group updates to reduce message frequency during high activity
5. **Metrics Streaming**: Add real-time resource usage metrics over WebSocket
6. **Binary Protocol**: Implement binary protocol for log streaming efficiency
7. **Selective Log Filtering**: Allow clients to request filtered logs by severity or pattern
8. **Heartbeat Mechanism**: Custom heartbeat for better connection health monitoring
