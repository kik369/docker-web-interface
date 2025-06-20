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
    isInView?: boolean;
    logFlushDelay?: number; // Optional parameter to configure log flush delay
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
const containerVisibility = new Map<string, boolean>();
const activeTimeouts = new Map<string, NodeJS.Timeout>(); // Added for managing timeouts

// Helper function to clear timeout for a specific container
const clearContainerTimeout = (containerId: string): void => {
    const existingTimeout = activeTimeouts.get(containerId);
    if (existingTimeout) {
        try {
            // Use global clearTimeout if available, fallback to noop in test environment
            if (typeof clearTimeout !== 'undefined') {
                clearTimeout(existingTimeout);
            } else if (typeof global !== 'undefined' && global.clearTimeout) {
                global.clearTimeout(existingTimeout);
            } else if (typeof window !== 'undefined' && window.clearTimeout) {
                window.clearTimeout(existingTimeout);
            }
        } catch (error) {
            // Silently handle clearTimeout errors in test environment
            logger.debug('Failed to clear timeout in test environment:', { containerId, error });
        }
        activeTimeouts.delete(containerId);
        pendingFlushes.delete(containerId);
        logger.debug('Cleared existing timeout for container:', { containerId });
    }
};

const initializeSocket = () => {
    if (globalSocket || isInitializing) return;

    isInitializing = true;
    try {
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
        globalSocket.on('connect_error', (error: any) => {
            logger.error('Connection error:', error);
            globalHandlers.forEach(handler => handler.onError?.(`Connection error: ${error?.message || 'Unknown error'}`));
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

        globalSocket.on('disconnect', (reason: any) => {
            logger.info('Disconnected from WebSocket server:', { reason });
            
            // Clear all pending timeouts on disconnect to prevent memory leaks
            for (const containerId of activeTimeouts.keys()) {
                clearContainerTimeout(containerId);
            }
            
            if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
                setTimeout(() => {
                    if (globalSocket !== null && !globalSocket.connected && activeSubscriptions > 0) {
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

        // Also handle the alternative event name for backward compatibility
        globalSocket.on('container_state_changed', (data: ContainerState) => {
            logger.info('Received container state changed (legacy event):', data);
            globalHandlers.forEach(handler => handler.onContainerStateChange?.(data));
        });

        // Handle initial state
        globalSocket.on('initial_state', (data: { containers: ContainerState[] }) => {
            logger.info(`Received initial container states: ${data.containers.length}`);
            globalHandlers.forEach(handler => handler.onInitialState?.(data.containers));
        });

        // Handle log updates with improved buffering for more responsive streaming
        globalSocket.on('log_update', (data: { container_id: string; log: string }) => {
            logger.debug('Received log update:', {
                containerId: data.container_id,
                logLength: data.log.length,
                logSample: data.log.substring(0, 50) + (data.log.length > 50 ? '...' : '')
            });

            const containerId = data.container_id;
            const logBuffer = logBuffers.get(containerId) || '';
            const newBuffer = logBuffer + data.log;
            logBuffers.set(containerId, newBuffer);

            if (!pendingFlushes.has(containerId)) {
                // Clear any existing timeout for this container before creating a new one
                clearContainerTimeout(containerId);
                
                pendingFlushes.add(containerId);
                // Find a logFlushDelay from any handler, fallback to 200ms
                let logFlushDelay = 200;
                for (const handler of globalHandlers) {
                    if (handler.logFlushDelay !== undefined) {
                        logFlushDelay = handler.logFlushDelay;
                        break;
                    }
                }
                // Use setTimeout safely - handle test environment
                let timeoutFn: typeof setTimeout;
                if (typeof setTimeout !== 'undefined') {
                    timeoutFn = setTimeout;
                } else if (typeof global !== 'undefined' && global.setTimeout) {
                    timeoutFn = global.setTimeout;
                } else if (typeof window !== 'undefined' && window.setTimeout) {
                    timeoutFn = window.setTimeout;
                } else {
                    // Fallback for test environment - create a simple mock
                    timeoutFn = ((fn: () => void, ms: number) => {
                        return setTimeout(fn, ms);
                    }) as typeof setTimeout;
                }
                
                const timeoutId = timeoutFn(() => {
                    const bufferToFlush = logBuffers.get(containerId) || '';
                    if (bufferToFlush.length > 0) {
                        logBuffers.set(containerId, ''); // Clear buffer for this container
                        logger.debug('Flushing log buffer:', {
                            containerId,
                            bufferLength: bufferToFlush.length,
                            lineCount: (bufferToFlush.match(/\n/g) || []).length + 1
                        });
                        globalHandlers.forEach(handler => {
                            if (handler.onLogUpdate) {
                                try {
                                    handler.onLogUpdate(containerId, bufferToFlush);
                                } catch (error: any) {
                                    logger.error('Error in log update handler:', error instanceof Error ? error : new Error(String(error)));
                                }
                            }
                        });
                    }
                    // Clean up after timeout completion
                    pendingFlushes.delete(containerId);
                    activeTimeouts.delete(containerId);
                }, logFlushDelay);
                activeTimeouts.set(containerId, timeoutId); // Store the timeout ID
            }
        });

        globalSocket.connect();
    } catch (error: any) {
        logger.error('Error during WebSocket initialization:', error instanceof Error ? error : new Error(String(error)));
    } finally {
        isInitializing = false;
    }
};

interface UseWebSocketReturn {
    startLogStream: (containerId: string, isVisible?: boolean) => void;
    stopLogStream: (containerId: string) => void;
    isConnected: boolean;
}

export const useWebSocket = ({
    onLogUpdate,
    onContainerStateChange,
    onInitialState,
    onError,
    enabled = true,
    isInView = true,
    logFlushDelay
}: UseWebSocketProps): UseWebSocketReturn => {
    // Create a handler ref to keep it stable between renders
    const handlers = useRef<UseWebSocketProps>({
        onLogUpdate,
        onContainerStateChange,
        onInitialState,
        onError,
        isInView,
        logFlushDelay
    });

    const [isConnected, setIsConnected] = useState(false);

    // Update handlers when props change
    useEffect(() => {
        handlers.current = {
            onLogUpdate,
            onContainerStateChange,
            onInitialState,
            onError,
            isInView,
            logFlushDelay
        };
    }, [onLogUpdate, onContainerStateChange, onInitialState, onError, isInView, logFlushDelay]);

    useEffect(() => {
        globalHandlers.add(handlers.current);
        activeSubscriptions++;
        initializeSocket();
        const handleConnect = () => setIsConnected(true);
        const handleDisconnect = () => setIsConnected(false);
        if (globalSocket !== null) {
            globalSocket.on('connect', handleConnect);
            globalSocket.on('disconnect', handleDisconnect);
        }
        return () => {
            activeSubscriptions--;
            globalHandlers.delete(handlers.current);
            if (globalSocket !== null) {
                globalSocket.off('connect', handleConnect);
                globalSocket.off('disconnect', handleDisconnect);
                if (activeSubscriptions <= 0) {
                    logger.info('Cleaning up last WebSocket connection');
                    
                    // Clear all pending timeouts when cleaning up the last subscription
                    for (const containerId of activeTimeouts.keys()) {
                        clearContainerTimeout(containerId);
                    }
                    logBuffers.clear();
                    containerVisibility.clear();
                    
                    globalSocket.disconnect();
                    globalSocket = null;
                    isInitializing = false;
                    activeSubscriptions = 0;
                }
            }
        };
    }, [enabled]);

    const startLogStream = useCallback((containerId: string, isVisible: boolean = true) => {
        if (globalSocket && enabled) {
            if (!pendingFlushes.has(containerId)) {
                logBuffers.set(containerId, '');
            } else {
                logger.warn('Skipping buffer clear due to pending flush', { containerId });
            }

            containerVisibility.set(containerId, isVisible);

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

            // Use centralized cleanup function
            clearContainerTimeout(containerId);
            logBuffers.set(containerId, ''); // Clear buffer
        }
    }, [enabled]);

    return {
        startLogStream,
        stopLogStream,
        isConnected,
    };
};
