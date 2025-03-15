import { useEffect, useCallback, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../config';
import { logger } from '../services/logging';

interface ContainerState {
    container_id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    ports: string;
    compose_project: string;
    compose_service: string;
    created: string;
}

interface UseWebSocketProps {
    onLogUpdate?: (containerId: string, log: string) => void;
    onContainerStateChange?: (containerData: ContainerState) => void;
    onInitialState?: (containers: ContainerState[]) => void;
    onError?: (error: string) => void;
    enabled?: boolean;
}

interface WebSocketError {
    error: string;
}

// Singleton state management
let globalSocket: Socket | null = null;
let activeSubscriptions = 0;
let isInitializing = false;
let globalHandlers: Set<UseWebSocketProps> = new Set();

// Moved outside the initializeSocket function to ensure they persist
const logBuffers = new Map<string, string>();
const pendingFlushes = new Set<string>();

const initializeSocket = () => {
    if (globalSocket || isInitializing) return;

    isInitializing = true;
    logger.info('Initializing WebSocket connection...');

    globalSocket = io(config.API_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 60000,
        forceNew: false,
        autoConnect: true,
    });

    // Global error handlers
    globalSocket.on('connect_error', (error) => {
        logger.error('Connection error:', error);
        globalHandlers.forEach(handler => handler.onError?.(`Connection error: ${error.message}`));
    });

    globalSocket.on('error', (error: WebSocketError) => {
        logger.error('Socket error:', new Error(error.error));
        globalHandlers.forEach(handler => handler.onError?.(error.error));
    });

    globalSocket.on('connect', () => {
        logger.info('Connected to WebSocket server');
        isInitializing = false;
    });

    globalSocket.on('connection_established', (data: { message: string }) => {
        logger.info('WebSocket connection established:', data);
    });

    globalSocket.on('disconnect', (reason) => {
        logger.info('Disconnected from WebSocket server:', { reason });
        if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
            setTimeout(() => {
                if (globalSocket && !globalSocket.connected && activeSubscriptions > 0) {
                    logger.info('Attempting to reconnect...');
                    globalSocket.connect();
                }
            }, 1000);
        }
    });

    // Initialize event handlers for container state updates
    globalSocket.on('container_state_change', (data: ContainerState) => {
        logger.info('Received container state change:', data);
        globalHandlers.forEach(handler => handler.onContainerStateChange?.(data));
    });

    // Handle initial state
    globalSocket.on('initial_state', (data: { containers: ContainerState[] }) => {
        logger.info(`Received initial container states: ${data.containers.length}`);
        globalHandlers.forEach(handler => handler.onInitialState?.(data.containers));
    });

    // Handle log updates with improved buffering for more responsive streaming
    globalSocket.on('log_update', (data: { container_id: string; log: string }) => {
        // Enhanced logging to debug real-time updates
        logger.debug('Received log update:', {
            containerId: data.container_id,
            logLength: data.log.length,
            logSample: data.log.substring(0, 50) + (data.log.length > 50 ? '...' : '')
        });

        // Group log updates by container ID to minimize re-renders
        const containerId = data.container_id;
        const logBuffer = logBuffers.get(containerId) || '';
        const newBuffer = logBuffer + data.log;
        logBuffers.set(containerId, newBuffer);

        // If there's a pending flush, don't schedule another one
        if (!pendingFlushes.has(containerId)) {
            pendingFlushes.add(containerId);

            // Use a shorter delay for more responsive updates
            setTimeout(() => {
                const bufferToFlush = logBuffers.get(containerId) || '';
                if (bufferToFlush.length > 0) {
                    // Clear the buffer right away before processing
                    logBuffers.set(containerId, '');
                    pendingFlushes.delete(containerId);

                    // Log more details to help debug streaming issues
                    logger.debug('Flushing log buffer:', {
                        containerId,
                        bufferLength: bufferToFlush.length,
                        lineCount: (bufferToFlush.match(/\n/g) || []).length + 1
                    });

                    // Notify all registered handlers about the log update
                    globalHandlers.forEach(handler => {
                        if (handler.onLogUpdate) {
                            try {
                                handler.onLogUpdate(containerId, bufferToFlush);
                            } catch (error) {
                                logger.error('Error in log update handler:', error instanceof Error ? error : new Error(String(error)));
                            }
                        }
                    });
                } else {
                    // Buffer was empty, just clear the pending status
                    pendingFlushes.delete(containerId);
                }
            }, 5); // Ultra-responsive 5ms delay
        }
    });

    globalSocket.connect();
};

export const useWebSocket = ({
    onLogUpdate,
    onContainerStateChange,
    onInitialState,
    onError,
    enabled = true
}: UseWebSocketProps) => {
    // Create a handler ref to keep it stable between renders
    const handlers = useRef<UseWebSocketProps>({
        onLogUpdate,
        onContainerStateChange,
        onInitialState,
        onError
    });

    const [isConnected, setIsConnected] = useState(false);

    // Update handlers when props change
    useEffect(() => {
        handlers.current = {
            onLogUpdate,
            onContainerStateChange,
            onInitialState,
            onError
        };
    }, [onLogUpdate, onContainerStateChange, onInitialState, onError]);

    useEffect(() => {
        if (!enabled) return;

        // Add the current handlers to the global set
        globalHandlers.add(handlers.current);
        activeSubscriptions++;

        // Initialize socket if needed
        initializeSocket();

        // Update connection status when socket connects/disconnects
        const handleConnect = () => setIsConnected(true);
        const handleDisconnect = () => setIsConnected(false);

        if (globalSocket) {
            globalSocket.on('connect', handleConnect);
            globalSocket.on('disconnect', handleDisconnect);
            setIsConnected(globalSocket.connected);
        }

        return () => {
            activeSubscriptions--;
            globalHandlers.delete(handlers.current);

            if (globalSocket) {
                globalSocket.off('connect', handleConnect);
                globalSocket.off('disconnect', handleDisconnect);
            }

            if (activeSubscriptions === 0 && globalSocket) {
                logger.info('Cleaning up last WebSocket connection');
                globalSocket.disconnect();
                globalSocket = null;
                isInitializing = false;
            }
        };
    }, [enabled]);

    const startLogStream = useCallback((containerId: string) => {
        if (globalSocket && enabled) {
            // Clear any existing buffer for this container
            logBuffers.set(containerId, '');
            if (pendingFlushes.has(containerId)) {
                pendingFlushes.delete(containerId);
            }

            // Start the stream
            globalSocket.emit('start_log_stream', { container_id: containerId });
            logger.info('Started log stream for container', { containerId });
        } else {
            logger.warn('Cannot start log stream - socket not ready', {
                socketExists: !!globalSocket,
                enabled
            });
        }
    }, [enabled]);

    const stopLogStream = useCallback((containerId: string) => {
        if (globalSocket && enabled) {
            globalSocket.emit('stop_log_stream', { container_id: containerId });
            logger.info('Stopped log stream for container', { containerId });

            // Clear any buffered logs for this container
            logBuffers.set(containerId, '');
            if (pendingFlushes.has(containerId)) {
                pendingFlushes.delete(containerId);
            }
        }
    }, [enabled]);

    return {
        startLogStream,
        stopLogStream,
        isConnected,
    };
};
