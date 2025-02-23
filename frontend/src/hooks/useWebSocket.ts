import { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../config';
import { logger } from '../services/logging';

interface UseWebSocketProps {
    onLogUpdate?: (containerId: string, log: string) => void;
    onContainerStateChange?: (containerId: string, state: string) => void;
    onContainerStatesBatch?: (states: Array<{ container_id: string; state: string }>) => void;
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

const initializeSocket = () => {
    if (globalSocket || isInitializing) return;

    isInitializing = true;
    globalSocket = io(config.API_URL, {
        transports: ['websocket'],  // Force WebSocket only
        reconnection: true,
        reconnectionAttempts: Infinity,  // Keep trying to reconnect
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        forceNew: false,
        autoConnect: false,
    });

    // Global error handlers
    globalSocket.on('connect_error', (error) => {
        logger.error('Connection error:', error);
        globalHandlers.forEach(handler => handler.onError?.(`Connection error: ${error.message}`));

        // If we get a transport error, try to reconnect after a delay
        if (error.message.includes('transport')) {
            setTimeout(() => {
                if (globalSocket && !globalSocket.connected && activeSubscriptions > 0) {
                    globalSocket.connect();
                }
            }, 1000);
        }
    });

    globalSocket.on('error', (error: WebSocketError) => {
        logger.error('Socket error:', new Error(error.error));
        globalHandlers.forEach(handler => handler.onError?.(error.error));
    });

    globalSocket.on('connect', () => {
        logger.info('Connected to WebSocket server');
        isInitializing = false;  // Reset initialization flag on successful connection
    });

    globalSocket.on('disconnect', (reason) => {
        logger.info('Disconnected from WebSocket server:', { reason });

        // Handle various disconnect reasons
        if (reason === 'io server disconnect' || reason === 'transport close') {
            setTimeout(() => {
                if (globalSocket && !globalSocket.connected && activeSubscriptions > 0) {
                    globalSocket.connect();
                }
            }, 1000);
        } else if (reason === 'ping timeout') {
            // For ping timeouts, try to create a new connection
            if (globalSocket) {
                globalSocket.disconnect();
                globalSocket = null;
                isInitializing = false;
                if (activeSubscriptions > 0) {
                    initializeSocket();
                }
            }
        }
    });

    // Initialize event handlers for all messages
    globalSocket.on('container_state_change', (data: { container_id: string; state: string }) => {
        globalHandlers.forEach(handler => handler.onContainerStateChange?.(data.container_id, data.state));
    });

    globalSocket.on('container_states_batch', (data: { states: Array<{ container_id: string; state: string }> }) => {
        globalHandlers.forEach(handler => handler.onContainerStatesBatch?.(data.states));
    });

    globalSocket.on('log_update', (data: { container_id: string; log: string }) => {
        globalHandlers.forEach(handler => handler.onLogUpdate?.(data.container_id, data.log));
    });

    globalSocket.connect();
};

export const useWebSocket = ({
    onLogUpdate,
    onContainerStateChange,
    onContainerStatesBatch,
    onError,
    enabled = false
}: UseWebSocketProps) => {
    const handlers = useRef<UseWebSocketProps>({ onLogUpdate, onContainerStateChange, onContainerStatesBatch, onError });

    useEffect(() => {
        if (!enabled) return;

        // Update handlers ref
        handlers.current = { onLogUpdate, onContainerStateChange, onContainerStatesBatch, onError };
        globalHandlers.add(handlers.current);
        activeSubscriptions++;

        // Initialize socket if needed
        initializeSocket();

        return () => {
            activeSubscriptions--;
            globalHandlers.delete(handlers.current);

            if (activeSubscriptions === 0 && globalSocket) {
                logger.info('Cleaning up last WebSocket connection');
                globalSocket.disconnect();
                globalSocket = null;
            }
        };
    }, [enabled, onLogUpdate, onContainerStateChange, onContainerStatesBatch, onError]);

    const startLogStream = useCallback((containerId: string) => {
        if (globalSocket && enabled) {
            globalSocket.emit('start_log_stream', { container_id: containerId });
            logger.info('Started log stream for container', { containerId });
        }
    }, [enabled]);

    return {
        startLogStream,
        isConnected: globalSocket?.connected || false,
    };
};
