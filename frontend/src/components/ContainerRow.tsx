/// <reference types="react" />
import React, { useRef, useEffect } from 'react';
import { IconBaseProps } from 'react-icons';
import { HiDocument, HiPlay, HiStop, HiRefresh, HiCog, HiTrash } from 'react-icons/hi';
import { ContainerRowProps } from '../types/docker';
import { logger } from '../services/logging';
import { config } from '../config';
import { useWebSocket } from '../hooks/useWebSocket';

// Create wrapper components for icons
const DocumentIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiDocument {...props} />
);

const PlayIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiPlay {...props} />
);

const StopIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiStop {...props} />
);

const RefreshIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiRefresh {...props} />
);

const CogIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiCog {...props} />
);

const TrashIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiTrash {...props} />
);

const LOGS_STORAGE_KEY_PREFIX = 'dockerWebInterface_logsViewed_';

const getStatusColor = (state: string | undefined, isActionLoading: string | null): string => {
    // If an action is in progress, show yellow pulsing indicator
    if (isActionLoading) {
        return 'bg-yellow-500 animate-pulse';
    }

    const stateLower = (state || '').toLowerCase();

    // Map states to colors
    switch (stateLower) {
        case 'running':
            return 'bg-green-500';
        case 'paused':
            return 'bg-yellow-500';
        case 'exited':
        case 'stopped':
        case 'dead':
            return 'bg-red-500';
        case 'created':
            return 'bg-blue-500';
        case 'restarting':
            return 'bg-yellow-500 animate-pulse';
        default:
            return 'bg-gray-500';
    }
};

export const ContainerRow: React.FC<ContainerRowProps> = ({
    container,
    isExpanded,
    onToggleExpand,
    onAction,
    actionInProgress
}) => {
    const [logs, setLogs] = React.useState<string>('');
    const [showLogs, setShowLogs] = React.useState<boolean>(() => {
        try {
            // Initialize from localStorage on component mount
            const saved = localStorage.getItem(`${LOGS_STORAGE_KEY_PREFIX}${container.id}`);
            return saved === 'true';
        } catch (err) {
            logger.error('Failed to load log view state from localStorage:', err instanceof Error ? err : new Error(String(err)));
            return false;
        }
    });
    const [isLoadingLogs, setIsLoadingLogs] = React.useState(false);
    const logContainerRef = useRef<HTMLPreElement>(null);

    // Save log view state to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem(`${LOGS_STORAGE_KEY_PREFIX}${container.id}`, showLogs.toString());
        } catch (err) {
            logger.error('Failed to save log view state to localStorage:', err instanceof Error ? err : new Error(String(err)));
        }
    }, [showLogs, container.id]);

    // Load logs if showLogs is true on mount or after state restoration
    useEffect(() => {
        if (showLogs) {
            handleViewLogs(true);
        }
    }, []); // Run only on mount

    const { startLogStream } = useWebSocket({
        onLogUpdate: (containerId, log) => {
            if (containerId === container.id && showLogs) {
                setLogs(prevLogs => prevLogs + log);
                // Auto-scroll to bottom
                if (logContainerRef.current) {
                    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                }
            }
        },
        onError: (error) => {
            logger.error('Error streaming logs:', new Error(error));
            console.error('Failed to stream logs:', error);
        }
    });

    const handleViewLogs = async (isRestoring: boolean = false) => {
        if (showLogs && !isRestoring) {
            setShowLogs(false);
            setLogs('');
            return;
        }

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

            setLogs(data.data.logs);
            if (!isRestoring) {
                setShowLogs(true);
            }
            // Start WebSocket streaming for new logs
            startLogStream(container.id);
            logger.info('Successfully fetched container logs', { containerId: container.id });
        } catch (err) {
            logger.error('Failed to fetch container logs', err instanceof Error ? err : undefined, {
                containerId: container.id
            });
            console.error('Failed to fetch logs:', err);
            // If there's an error while restoring state, reset the showLogs state
            if (isRestoring) {
                setShowLogs(false);
            }
        } finally {
            setIsLoadingLogs(false);
        }
    };

    const handleAction = async (action: string) => {
        try {
            await onAction(container.id, action);
        } catch (err) {
            logger.error(`Failed to perform ${action} action`, err instanceof Error ? err : undefined, {
                containerId: container.id,
                action
            });
            console.error(`Failed to ${action} container:`, err);
        }
    };

    // Get the status text based on current state and loading state
    const getStatusText = () => {
        if (actionInProgress) {
            switch (actionInProgress) {
                case 'stop':
                    return 'Stopping...';
                case 'start':
                    return 'Starting...';
                case 'restart':
                    return 'Restarting...';
                case 'rebuild':
                    return 'Rebuilding...';
                default:
                    return container.status;
            }
        }

        // When no action is in progress, show the actual container status
        return container.status;
    };

    // Determine if the container is actually running based on both state and status
    const isContainerRunning = container.state === 'running';

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(container.state, actionInProgress)}`} />
                        <div>
                            <div className="flex items-center space-x-2">
                                <h3 className="text-lg font-semibold text-white">{container.name}</h3>
                                {container.compose_project && container.compose_project !== 'Standalone Containers' &&
                                    container.compose_service && container.compose_service !== container.name && (
                                        <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                                            {container.compose_service}
                                        </span>
                                    )}
                            </div>
                            <p className="text-sm text-gray-400">Image: {container.image}</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => handleViewLogs()}
                            className="p-2 text-gray-400 hover:text-white transition-colors"
                            disabled={isLoadingLogs}
                            title={`Show logs (docker logs ${container.name})`}
                        >
                            <DocumentIcon className="w-5 h-5" />
                        </button>
                        {isContainerRunning ? (
                            <button
                                onClick={() => handleAction('stop')}
                                className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                                disabled={actionInProgress !== null}
                                title={`Stop container (docker stop ${container.name})`}
                            >
                                <StopIcon className={`w-5 h-5 ${actionInProgress === 'stop' ? 'animate-pulse' : ''}`} />
                            </button>
                        ) : (
                            <button
                                onClick={() => handleAction('start')}
                                className="p-2 text-gray-400 hover:text-green-400 transition-colors"
                                disabled={actionInProgress !== null}
                                title={`Start container (docker start ${container.name})`}
                            >
                                <PlayIcon className={`w-5 h-5 ${actionInProgress === 'start' ? 'animate-pulse' : ''}`} />
                            </button>
                        )}
                        <button
                            onClick={() => handleAction('restart')}
                            className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
                            disabled={actionInProgress !== null}
                            title={`Restart container (docker restart ${container.name})`}
                        >
                            <RefreshIcon className={`w-5 h-5 ${actionInProgress === 'restart' ? 'animate-pulse' : ''}`} />
                        </button>
                        <button
                            onClick={() => handleAction('rebuild')}
                            className="p-2 text-gray-400 hover:text-purple-400 transition-colors"
                            disabled={actionInProgress !== null}
                            title={`Rebuild container (docker pull ${container.image} && docker run ...)`}
                        >
                            <CogIcon className={`w-5 h-5 ${actionInProgress === 'rebuild' ? 'animate-pulse' : ''}`} />
                        </button>
                        <button
                            onClick={() => handleAction('delete')}
                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                            disabled={actionInProgress !== null}
                            title={`Delete container (docker rm -f ${container.name})`}
                        >
                            <TrashIcon className={`w-5 h-5 ${actionInProgress === 'delete' ? 'animate-pulse' : ''}`} />
                        </button>
                    </div>
                </div>
                <div className="mt-2 space-y-1">
                    <p className="text-sm text-gray-400">Status: <span className="text-gray-300">{getStatusText()}</span></p>
                    {container.ports && (
                        <p className="text-sm text-gray-400">Ports: <span className="text-gray-300">{container.ports}</span></p>
                    )}
                </div>
            </div>
            {showLogs && (
                <div className="px-4 pb-4">
                    <div className="bg-gray-900 p-4 rounded">
                        <pre
                            ref={logContainerRef}
                            className="text-sm text-gray-300 whitespace-pre-wrap max-h-96 overflow-y-auto"
                        >
                            {logs}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
};
