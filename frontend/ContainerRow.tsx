import React, { useCallback, useState, useRef } from 'react';
import { useWebSocket } from './src/hooks/useWebSocket';
import { config } from './src/config';
import { logger } from './src/services/logging';

const ContainerRow = ({ container, isExpanded, onToggleExpand }) => {
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState('');
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const logContainerRef = useRef<HTMLPreElement>(null);
    const [isStreamActive, setIsStreamActive] = useState(false);

    // Define useWebSocket hook first
    const { startLogStream } = useWebSocket({
        onLogUpdate: (containerId, log) => {
            if (containerId === container.id && showLogs) {
                setLogs(prevLogs => prevLogs + log);
                if (!isStreamActive) {
                    setIsStreamActive(true);
                    setIsLoadingLogs(false);
                }
                if (logContainerRef.current) {
                    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                }
            }
        },
        onError: (error) => {
            logger.error('Error streaming logs:', new Error(error));
            console.error('Failed to stream logs:', error);
            setIsLoadingLogs(false);
        },
        enabled: showLogs
    });

    // Remove toggling logic from handleViewLogs:
    const handleViewLogs = useCallback(async () => {
        try {
            logger.info('Fetching container logs', { containerId: container.id });
            setIsLoadingLogs(true);
            if (!isExpanded) {
                onToggleExpand();
            }
            const response = await fetch(`${config.API_URL}/api/containers/${container.id}/logs`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch logs');
            }

            setLogs(data.data.logs || '');
            setShowLogs(true);
            // Start WebSocket streaming for new logs
            startLogStream(container.id);
            setIsLoadingLogs(false);
            logger.info('Successfully fetched container logs', { containerId: container.id });
        } catch (err) {
            logger.error('Failed to fetch container logs', err instanceof Error ? err : undefined, {
                containerId: container.id
            });
            console.error('Failed to fetch logs:', err);
            setIsLoadingLogs(false);
        }
    }, [container.id, isExpanded, onToggleExpand, setLogs, setShowLogs, startLogStream]);

    // New handler to close logs explicitly:
    const handleCloseLogs = useCallback(() => {
        setShowLogs(false);
        setLogs('');
    }, [setShowLogs, setLogs]);

    return (
        <div>
            {showLogs && (
                <div className="bg-gray-900 p-4 rounded-lg mt-2">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold text-white">Container Logs</h3>
                        <button
                            onClick={handleCloseLogs}
                            className="text-xs text-gray-400 hover:text-white"
                        >
                            Close
                        </button>
                    </div>
                    {isLoadingLogs ? (
                        <div className="text-gray-400">Loading logs...</div>
                    ) : (
                        <pre
                            ref={logContainerRef}
                            className="bg-black p-3 rounded text-xs text-gray-300 font-mono overflow-auto max-h-96"
                        >
                            {logs || 'No logs available'}
                            {isStreamActive && showLogs && (
                                <div className="text-xs text-green-500 mt-2">
                                    Log streaming active...
                                </div>
                            )}
                        </pre>
                    )}
                </div>
            )}
            {/* Add button to open logs if not already shown */}
            {!showLogs && (
                <button
                    onClick={handleViewLogs}
                    className="text-xs text-gray-400 hover:text-white"
                >
                    Show Logs
                </button>
            )}
        </div>
    );
};

export default ContainerRow;
