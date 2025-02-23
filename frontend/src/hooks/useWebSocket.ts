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

// Singleton socket instance
let globalSocket: Socket | null = null;
let activeSubscriptions = 0;

export const useWebSocket = ({
    onLogUpdate,
    onContainerStateChange,
    onContainerStatesBatch,
    onError,
    enabled = false
}: UseWebSocketProps) => {
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        // Initialize or reuse socket connection
        if (!globalSocket) {
            globalSocket = io(config.API_URL, {
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 60000,
                forceNew: false,
                autoConnect: true,
                closeOnBeforeunload: true
            });
        }

        activeSubscriptions++;
        socketRef.current = globalSocket;

        if (!socketRef.current.connected) {
            socketRef.current.connect();
        }

        // Set up event listeners
        const handleConnect = () => {
            logger.info('Connected to WebSocket server');
        };

        const handleDisconnect = (reason: string) => {
            logger.info('Disconnected from WebSocket server:', { reason });
            if (reason === 'io server disconnect' && socketRef.current) {
                socketRef.current.connect();
            }
        };

        const handleConnectError = (error: Error) => {
            logger.error('WebSocket connection error:', error);
            onError?.(`Connection error: ${error.message}`);
        };

        const handleError = (error: WebSocketError) => {
            logger.error('WebSocket error:', new Error(error.error));
            onError?.(error.error);
        };

        const handleLogUpdate = (data: { container_id: string; log: string }) => {
            onLogUpdate?.(data.container_id, data.log);
        };

        const handleContainerStateChange = (data: { container_id: string; state: string }) => {
            logger.debug('Container state change received:', data);
            onContainerStateChange?.(data.container_id, data.state);
        };

        const handleContainerStatesBatch = (data: { states: Array<{ container_id: string; state: string }> }) => {
            logger.debug('Container states batch received:', data);
            onContainerStatesBatch?.(data.states);
        };

        socketRef.current.on('connect', handleConnect);
        socketRef.current.on('disconnect', handleDisconnect);
        socketRef.current.on('connect_error', handleConnectError);
        socketRef.current.on('error', handleError);
        socketRef.current.on('log_update', handleLogUpdate);
        socketRef.current.on('container_state_change', handleContainerStateChange);
        socketRef.current.on('container_states_batch', handleContainerStatesBatch);

        // Cleanup on unmount
        return () => {
            activeSubscriptions--;

            if (socketRef.current) {
                socketRef.current.off('connect', handleConnect);
                socketRef.current.off('disconnect', handleDisconnect);
                socketRef.current.off('connect_error', handleConnectError);
                socketRef.current.off('error', handleError);
                socketRef.current.off('log_update', handleLogUpdate);
                socketRef.current.off('container_state_change', handleContainerStateChange);
                socketRef.current.off('container_states_batch', handleContainerStatesBatch);
            }

            // Only disconnect if this is the last subscription
            if (activeSubscriptions === 0 && socketRef.current && globalSocket) {
                logger.info('Cleaning up WebSocket connection');
                socketRef.current.disconnect();
                globalSocket = null;
            }
        };
    }, [enabled, onLogUpdate, onContainerStateChange, onContainerStatesBatch, onError]);

    const startLogStream = useCallback((containerId: string) => {
        if (socketRef.current && enabled) {
            socketRef.current.emit('start_log_stream', { container_id: containerId });
            logger.info('Started log stream for container', { containerId });
        }
    }, [enabled]);

    return {
        startLogStream,
        isConnected: socketRef.current?.connected || false,
    };
};
