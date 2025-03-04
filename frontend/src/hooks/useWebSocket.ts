import { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../config';
import { logger } from '../services/logging';
import { ContainerStats } from '../types/docker';

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
    onStatsUpdate?: (containerId: string, stats: ContainerStats) => void;
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
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 60000,  // Match server timeout
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
        logger.info('Received initial container states:', data);
        globalHandlers.forEach(handler => handler.onInitialState?.(data.containers));
    });

    // Handle log updates
    globalSocket.on('log_update', (data: { container_id: string; log: string }) => {
        globalHandlers.forEach(handler => handler.onLogUpdate?.(data.container_id, data.log));
    });

    // Handle stats updates
    globalSocket.on('stats_update', (data: { container_id: string; stats: ContainerStats }) => {
        logger.info('Received container stats update:', {
            containerId: data.container_id,
            hasStats: !!data.stats,
            timestamp: data.stats?.timestamp || 'none',
            handlers: globalHandlers.size
        });
        globalHandlers.forEach(handler => handler.onStatsUpdate?.(data.container_id, data.stats));
    });

    globalSocket.connect();
    logger.info('Initializing WebSocket connection...');
};

export const useWebSocket = ({
    onLogUpdate,
    onContainerStateChange,
    onInitialState,
    onError,
    onStatsUpdate,
    enabled = true
}: UseWebSocketProps) => {
    const handlers = useRef<UseWebSocketProps>({
        onLogUpdate,
        onContainerStateChange,
        onInitialState,
        onError,
        onStatsUpdate
    });

    useEffect(() => {
        if (!enabled) return;

        // Update handlers ref
        handlers.current = { onLogUpdate, onContainerStateChange, onInitialState, onError, onStatsUpdate };
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
                isInitializing = false;
            }
        };
    }, [enabled, onLogUpdate, onContainerStateChange, onInitialState, onError, onStatsUpdate]);

    const startLogStream = useCallback((containerId: string) => {
        if (globalSocket && enabled) {
            globalSocket.emit('start_log_stream', { container_id: containerId });
            logger.info('Started log stream for container', { containerId });
        }
    }, [enabled]);

    const startStatsStream = useCallback((containerId: string) => {
        if (globalSocket && enabled) {
            globalSocket.emit('start_stats_stream', { container_id: containerId });
            logger.info('Started stats stream for container', { containerId });
        }
    }, [enabled]);

    return {
        startLogStream,
        startStatsStream,
        isConnected: globalSocket?.connected || false,
    };
};
