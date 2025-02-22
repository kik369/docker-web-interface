import { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '../config';
import { logger } from '../services/logging';

interface UseWebSocketProps {
    onLogUpdate?: (containerId: string, log: string) => void;
    onError?: (error: string) => void;
}

interface WebSocketError {
    error: string;
}

export const useWebSocket = ({ onLogUpdate, onError }: UseWebSocketProps) => {
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // Initialize socket connection
        socketRef.current = io(config.API_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        // Set up event listeners
        socketRef.current.on('connect', () => {
            logger.info('Connected to WebSocket server');
        });

        socketRef.current.on('disconnect', () => {
            logger.info('Disconnected from WebSocket server');
        });

        socketRef.current.on('error', (error: WebSocketError) => {
            logger.error('WebSocket error:', new Error(error.error));
            onError?.(error.error);
        });

        socketRef.current.on('log_update', (data: { container_id: string; log: string }) => {
            onLogUpdate?.(data.container_id, data.log);
        });

        // Cleanup on unmount
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, [onLogUpdate, onError]);

    const startLogStream = useCallback((containerId: string) => {
        if (socketRef.current) {
            socketRef.current.emit('start_log_stream', { container_id: containerId });
            logger.info('Started log stream for container', { containerId });
        }
    }, []);

    return {
        startLogStream,
        isConnected: socketRef.current?.connected || false,
    };
};
