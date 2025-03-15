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

The application implements an efficient real-time log streaming system that provides continuous updates as logs are generated by containers.

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
        # Create a unique key for this stream
        stream_key = f"{request.sid}_{container_id}"
        self.active_streams[stream_key] = False  # False means don't stop

        # Capture request context values before starting the background task
        sid = request.sid

        def stream_logs_background():
            """Background task to stream container logs to the client."""
            try:
                # First, get initial logs to display
                initial_logs, error = self.docker_service.get_container_logs(
                    container_id, lines=100
                )

                if initial_logs:
                    self.socketio.emit(
                        "log_update",
                        {"container_id": container_id, "log": initial_logs},
                        room=sid,
                    )

                # Determine timestamp of last log to avoid duplication
                last_log_time = None
                if initial_logs:
                    try:
                        log_lines = initial_logs.strip().split("\n")
                        if log_lines:
                            last_line = log_lines[-1]
                            timestamp_match = re.match(
                                r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})",
                                last_line,
                            )
                            if timestamp_match:
                                timestamp_str = timestamp_match.group(1)
                                last_log_time = int(
                                    datetime.strptime(
                                        timestamp_str, "%Y-%m-%dT%H:%M:%S"
                                    ).timestamp()
                                )
                    except Exception as e:
                        logger.warning(f"Failed to parse log timestamp: {e}")

                # Start streaming new logs from the timestamp
                log_generator = self.docker_service.stream_container_logs(
                    container_id, since=last_log_time
                )

                if log_generator:
                    for log_line in log_generator:
                        # Check if client still connected or requested stop
                        if sid not in self.socketio.server.manager.rooms.get(
                            "/", {}
                        ) or self.active_streams.get(stream_key, True):
                            break

                        # Send log line to client in real-time
                        self.socketio.emit(
                            "log_update",
                            {"container_id": container_id, "log": log_line},
                            room=sid,
                        )
            except Exception as e:
                logger.error(f"Error in log stream: {str(e)}")
                self.socketio.emit(
                    "error",
                    {"error": f"Error streaming logs: {str(e)}"},
                    room=sid,
                )

            # Clean up when done
            if stream_key in self.active_streams:
                del self.active_streams[stream_key]

        # Start background task for streaming
        eventlet.spawn(stream_logs_background)
        return {"status": "stream_started"}

    except Exception as e:
        emit('error', {'error': f'Failed to start log stream: {str(e)}'})
```

### Optimized Log Streaming

The Docker service is configured to stream logs efficiently:

```python
def stream_container_logs(
    self, container_id: str, since: Optional[int] = None
) -> Generator[str, None, None]:
    """Stream logs for a specific container."""
    try:
        container = self.client.containers.get(container_id)
        # Ensure we're using the most efficient streaming options
        stream = container.logs(
            stream=True,
            follow=True,
            timestamps=True,
            since=since,
            tail=0  # Don't include historical logs, we already fetched those
        )
        for chunk in stream:
            if isinstance(chunk, bytes):
                yield chunk.decode("utf-8")
    except docker.errors.NotFound:
        error_msg = f"Container {container_id} not found"
        logger.error(error_msg)
        yield f"Error: {error_msg}"
    except Exception as e:
        error_msg = f"Failed to stream container logs: {str(e)}"
        logger.error(error_msg)
        yield f"Error: {error_msg}"
```

### Frontend Log Buffer System

The frontend implements an optimized buffering system to balance responsiveness with performance:

```typescript
// Log buffering to prevent excessive re-renders
const logBuffers = new Map<string, string>();
const pendingFlushes = new Set<string>();

// Handle log updates with improved buffering for more responsive streaming
globalSocket.on('log_update', (data: { container_id: string; log: string }) => {
    // Group log updates by container ID to minimize re-renders
    const containerId = data.container_id;
    const logBuffer = logBuffers.get(containerId) || '';
    const newBuffer = logBuffer + data.log;
    logBuffers.set(containerId, newBuffer);

    // If there's a pending flush, don't schedule another one
    if (!pendingFlushes.has(containerId)) {
        pendingFlushes.add(containerId);

        // Flush buffer after a short delay - using a shorter delay for more responsive updates
        setTimeout(() => {
            const bufferToFlush = logBuffers.get(containerId) || '';
            logBuffers.set(containerId, '');
            pendingFlushes.delete(containerId);

            // Only notify handlers if there's something to flush
            if (bufferToFlush) {
                globalHandlers.forEach(handler =>
                    handler.onLogUpdate?.(containerId, bufferToFlush)
                );
            }
        }, 10); // Short delay for responsive updates while still batching
    }
});
```

### User Experience Enhancements

The log viewer component includes several UX improvements for real-time log streaming:

1. **Auto-scrolling**: Logs automatically scroll to show the newest entries as they arrive
2. **Scroll Pause Detection**: When a user manually scrolls up, auto-scrolling is paused
3. **Follow Button**: A "Follow Logs" button appears when auto-scrolling is paused, allowing users to resume following new logs
4. **Visual Indicators**: A pulsing indicator shows when log streaming is active
5. **Timestamp Display**: Last update time is shown to indicate recency of log data

```jsx
// LogContainer component with auto-scroll and user interaction handling
const LogContainer = React.memo(
    ({ logs, isLoading, containerId, onClose, isStreamActive }) => {
        const logContainerRef = useRef < HTMLPreElement > null;
        const [lastUpdateTime, setLastUpdateTime] =
            useState < Date > new Date();
        const [autoScroll, setAutoScroll] = useState(true);

        // Scroll to bottom when logs update, but only if autoScroll is enabled
        useEffect(() => {
            if (logContainerRef.current && logs && autoScroll) {
                logContainerRef.current.scrollTop =
                    logContainerRef.current.scrollHeight;
                setLastUpdateTime(new Date());
            }
        }, [logs, autoScroll]);

        // Detect when user manually scrolls to disable auto-scroll
        const handleScroll = useCallback(() => {
            if (!logContainerRef.current) return;

            const { scrollTop, scrollHeight, clientHeight } =
                logContainerRef.current;
            const isScrolledToBottom =
                scrollHeight - scrollTop - clientHeight < 50;

            if (isScrolledToBottom !== autoScroll) {
                setAutoScroll(isScrolledToBottom);
            }
        }, [autoScroll]);

        return (
            <div className='log-container'>
                <div className='log-header'>
                    <span>Last update: {formattedTime}</span>
                    {!autoScroll && (
                        <button onClick={() => setAutoScroll(true)}>
                            Follow Logs
                        </button>
                    )}
                </div>
                <pre
                    ref={logContainerRef}
                    onScroll={handleScroll}
                    className='log-content'
                >
                    {logs}
                    {isStreamActive && (
                        <div className='streaming-indicator'>
                            Log streaming active...
                        </div>
                    )}
                </pre>
            </div>
        );
    }
);
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
