import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from './useWebSocket';
import { io } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client');
const mockIo = io as jest.MockedFunction<typeof io>;

// Mock the config
jest.mock('../config', () => ({
    config: {
        API_URL: 'http://localhost:5000'
    }
}));

// Mock the logger
jest.mock('../services/logging', () => ({
    logger: {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
    }
}));

describe('useWebSocket', () => {
    let mockSocket: any;
    let eventHandlers: Record<string, Function>;

    beforeEach(() => {
        jest.clearAllMocks();
        eventHandlers = {};
        
        mockSocket = {
            on: jest.fn((event: string, handler: Function) => {
                eventHandlers[event] = handler;
            }),
            off: jest.fn(),
            emit: jest.fn(),
            connect: jest.fn(),
            disconnect: jest.fn(),
            connected: true
        };
        
        mockIo.mockReturnValue(mockSocket);
        
        // Clear any global state
        jest.clearAllTimers();
        jest.useFakeTimers();
        
        // Ensure setTimeout and clearTimeout are available and properly mocked
        (global as any).setTimeout = jest.fn((fn, ms) => {
            return 'mock-timeout-id' as any;
        });
        (global as any).clearTimeout = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    describe('timeout cleanup', () => {
        it('should clear timeout when stopLogStream is called', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            const { result } = renderHook(() => useWebSocket({
                onLogUpdate: jest.fn()
            }));

            // Simulate starting log stream
            act(() => {
                result.current.startLogStream('container1');
            });

            // Simulate receiving log update to create timeout
            act(() => {
                eventHandlers['log_update']({
                    container_id: 'container1',
                    log: 'test log'
                });
            });

            // Advance timer to create timeout
            act(() => {
                jest.advanceTimersByTime(100);
            });

            // Stop log stream should clear timeout
            act(() => {
                result.current.stopLogStream('container1');
            });

            expect(clearTimeoutSpy).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });

        it('should clear all timeouts on disconnect', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            
            const { result } = renderHook(() => useWebSocket({
                onLogUpdate: jest.fn()
            }));

            // Start log streams for multiple containers
            act(() => {
                result.current.startLogStream('container1');
                result.current.startLogStream('container2');
            });
            
            // Simulate log updates for both containers to create timeouts
            act(() => {
                eventHandlers['log_update']({
                    container_id: 'container1',
                    log: 'log1'
                });
                eventHandlers['log_update']({
                    container_id: 'container2',
                    log: 'log2'
                });
            });

            // Clear any previous calls before testing cleanup
            clearTimeoutSpy.mockClear();

            // Simulate disconnect (this should trigger cleanup)
            act(() => {
                eventHandlers['disconnect']('io server disconnect');
            });

            // Should have cleared timeouts - expect at least one call 
            expect(clearTimeoutSpy).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });

        it('should clear all timeouts when hook unmounts', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});
            
            const { result, unmount } = renderHook(() => useWebSocket({
                onLogUpdate: jest.fn()
            }));

            // Start log stream and create timeout
            act(() => {
                result.current.startLogStream('container1');
                eventHandlers['log_update']({
                    container_id: 'container1',
                    log: 'test log'
                });
            });

            // Unmount component
            unmount();

            expect(clearTimeoutSpy).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });

        it('should not leak timeouts when component unmounts rapidly', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});
            
            // Mount and unmount multiple components rapidly
            for (let i = 0; i < 5; i++) {
                const { result, unmount } = renderHook(() => useWebSocket({
                    onLogUpdate: jest.fn()
                }));

                act(() => {
                    result.current.startLogStream(`container${i}`);
                    eventHandlers['log_update']({
                        container_id: `container${i}`,
                        log: `log${i}`
                    });
                });

                unmount();
            }

            // Should have cleared timeouts for each unmount
            expect(clearTimeoutSpy).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });

        it('should replace timeout when new log stream starts for same container', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            const { result } = renderHook(() => useWebSocket({
                onLogUpdate: jest.fn()
            }));

            // Start log stream
            act(() => {
                result.current.startLogStream('container1');
            });

            // Create first timeout
            act(() => {
                eventHandlers['log_update']({
                    container_id: 'container1',
                    log: 'first log'
                });
            });

            // Stop and restart log stream
            act(() => {
                result.current.stopLogStream('container1');
                result.current.startLogStream('container1');
            });

            // Create second timeout
            act(() => {
                eventHandlers['log_update']({
                    container_id: 'container1',
                    log: 'second log'
                });
            });

            // Should have cleared the first timeout when stopping
            expect(clearTimeoutSpy).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });

        it('should handle timeout flush correctly', () => {
            const onLogUpdate = jest.fn();
            const { result } = renderHook(() => useWebSocket({
                onLogUpdate,
                logFlushDelay: 100
            }));

            act(() => {
                result.current.startLogStream('container1');
            });

            // Send log update
            act(() => {
                eventHandlers['log_update']({
                    container_id: 'container1',
                    log: 'test log line\n'
                });
            });

            // Before timeout, should not have flushed
            expect(onLogUpdate).not.toHaveBeenCalled();

            // Advance timer to trigger flush
            act(() => {
                jest.advanceTimersByTime(100);
            });

            // Should have flushed the log
            expect(onLogUpdate).toHaveBeenCalledWith('container1', 'test log line\n');
        });

        it('should buffer multiple log updates and flush together', () => {
            const onLogUpdate = jest.fn();
            const { result } = renderHook(() => useWebSocket({
                onLogUpdate,
                logFlushDelay: 200
            }));

            act(() => {
                result.current.startLogStream('container1');
            });

            // Send multiple log updates rapidly
            act(() => {
                eventHandlers['log_update']({
                    container_id: 'container1',
                    log: 'line 1\n'
                });
                eventHandlers['log_update']({
                    container_id: 'container1',
                    log: 'line 2\n'
                });
                eventHandlers['log_update']({
                    container_id: 'container1',
                    log: 'line 3\n'
                });
            });

            // Should only create one timeout (no additional timeouts for pending flushes)
            expect(onLogUpdate).not.toHaveBeenCalled();

            // Advance timer to trigger flush
            act(() => {
                jest.advanceTimersByTime(200);
            });

            // Should have flushed all buffered logs together
            expect(onLogUpdate).toHaveBeenCalledTimes(1);
            expect(onLogUpdate).toHaveBeenCalledWith('container1', 'line 1\nline 2\nline 3\n');
        });
    });

    describe('WebSocket connection management', () => {
        it('should initialize WebSocket connection', () => {
            renderHook(() => useWebSocket({
                onLogUpdate: jest.fn()
            }));

            expect(mockIo).toHaveBeenCalledWith('http://localhost:5000', expect.objectContaining({
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: Infinity
            }));
        });

        it('should handle connection errors', () => {
            const onError = jest.fn();
            renderHook(() => useWebSocket({
                onError
            }));

            act(() => {
                eventHandlers['connect_error'](new Error('Connection failed'));
            });

            expect(onError).toHaveBeenCalledWith('Connection error: Connection failed');
        });

        it('should handle socket errors', () => {
            const onError = jest.fn();
            renderHook(() => useWebSocket({
                onError
            }));

            act(() => {
                eventHandlers['error']({ error: 'Socket error occurred' });
            });

            expect(onError).toHaveBeenCalledWith('Socket error occurred');
        });

        it('should clean up socket when last subscription is removed', () => {
            const { unmount } = renderHook(() => useWebSocket({
                onLogUpdate: jest.fn()
            }));

            unmount();

            expect(mockSocket.disconnect).toHaveBeenCalled();
        });
    });

    describe('container state updates', () => {
        it('should handle container state changes', () => {
            const onContainerStateChange = jest.fn();
            renderHook(() => useWebSocket({
                onContainerStateChange
            }));

            const containerData = {
                container_id: 'test-container',
                name: 'test',
                image: 'nginx',
                status: 'running',
                state: 'running',
                ports: '80:8080',
                compose_project: 'test-project',
                compose_service: 'web',
                created: '2023-01-01'
            };

            act(() => {
                eventHandlers['container_state_change'](containerData);
            });

            expect(onContainerStateChange).toHaveBeenCalledWith(containerData);
        });

        it('should handle initial state', () => {
            const onInitialState = jest.fn();
            renderHook(() => useWebSocket({
                onInitialState
            }));

            const containers = [
                {
                    container_id: 'container1',
                    name: 'test1',
                    image: 'nginx',
                    status: 'running',
                    state: 'running',
                    ports: '80:8080',
                    compose_project: 'project1',
                    compose_service: 'web',
                    created: '2023-01-01'
                }
            ];

            act(() => {
                eventHandlers['initial_state']({ containers });
            });

            expect(onInitialState).toHaveBeenCalledWith(containers);
        });
    });

    describe('log streaming', () => {
        it('should start log stream correctly', () => {
            const { result } = renderHook(() => useWebSocket({
                onLogUpdate: jest.fn()
            }));

            act(() => {
                result.current.startLogStream('container1', true);
            });

            expect(mockSocket.emit).toHaveBeenCalledWith('start_log_stream', {
                container_id: 'container1'
            });
        });

        it('should stop log stream correctly', () => {
            const { result } = renderHook(() => useWebSocket({
                onLogUpdate: jest.fn()
            }));

            act(() => {
                result.current.stopLogStream('container1');
            });

            expect(mockSocket.emit).toHaveBeenCalledWith('stop_log_stream', {
                container_id: 'container1'
            });
        });
    });
});