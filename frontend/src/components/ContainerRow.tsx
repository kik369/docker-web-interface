/// <reference types="react" />
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { IconBaseProps } from 'react-icons';
import { HiDocument, HiPlay, HiStop, HiRefresh, HiCog, HiTrash, HiOutlineTemplate, HiOutlineStatusOnline } from 'react-icons/hi';
import { HiOutlineInformationCircle, HiOutlineDesktopComputer, HiOutlineServer } from 'react-icons/hi';
import { ContainerRowProps } from '../types/docker';
import { logger } from '../services/logging';
import { config } from '../config';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTheme } from '../context/ThemeContext';
import LogContainer from './LogContainer';

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
            return 'bg-green-400 animate-soft-pulse';
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

// Get descriptive status message for tooltip
const getStatusDescription = (state: string | undefined, actionInProgress: string | null): string => {
    if (actionInProgress) {
        return actionInProgress.charAt(0).toUpperCase() + actionInProgress.slice(1) + '...';
    }

    // Return the same status value that's shown in the UI for consistency
    return state || 'Unknown';
};

// Port mapping display component
const PortDisplay: React.FC<{ portsString: string }> = ({ portsString }) => {
    const { theme } = useTheme();

    if (!portsString) return null;

    const portMappings = portsString.split(', ');

    return (
        <div className="flex flex-wrap gap-2">
            {portMappings.map((mapping, index) => {
                const [hostPort, containerPort] = mapping.split('->');

                // Check if the port includes protocol info (tcp/udp)
                const [port, protocol] = containerPort ? containerPort.split('/') : [hostPort, ''];

                return (
                    <div key={index} className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs font-mono ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                        {containerPort ? (
                            <>
                                <span className="flex items-center mr-1" title="Host Port (your computer)">
                                    <HiOutlineDesktopComputer className="mr-1 text-blue-400" />
                                    {hostPort}
                                </span>
                                <span className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mx-1`}>→</span>
                                <span className="flex items-center" title="Container Port (inside Docker)">
                                    <HiOutlineServer className="mr-1 text-green-400" />
                                    {port}
                                </span>
                            </>
                        ) : (
                            <span className="flex items-center">
                                <HiOutlineServer className="mr-1 text-green-400" />
                                {port}
                            </span>
                        )}

                        {protocol && (
                            <div className="relative inline-block ml-1 group">
                                <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{protocol}</span>
                                <HiOutlineInformationCircle className={`inline-block ml-1 ${theme === 'dark' ? 'text-gray-400 hover:text-blue-400' : 'text-gray-500 hover:text-blue-500'} cursor-help`} />
                                <div className={`absolute hidden group-hover:block bottom-full left-1/2 transform -translate-x-1/2 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-500'} text-white p-2 rounded shadow-lg w-64 z-10 text-xs`}>
                                    {protocol.toLowerCase() === 'tcp' ? (
                                        <>TCP (Transmission Control Protocol): Reliable, connection-oriented protocol that ensures data delivery.</>
                                    ) : protocol.toLowerCase() === 'udp' ? (
                                        <>UDP (User Datagram Protocol): Faster, connectionless protocol used for speed over reliability.</>
                                    ) : (
                                        <>{protocol} Protocol</>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// Tooltip component that uses ReactDOM.createPortal to avoid positioning issues
interface TooltipProps {
    children: React.ReactNode;
    text: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ children, text }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const { theme } = useTheme();

    const updateTooltipPosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPosition({
                top: rect.top - 5,
                left: rect.left + rect.width / 2
            });
        }
    };

    const handleMouseEnter = () => {
        updateTooltipPosition();
        setShowTooltip(true);
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    useEffect(() => {
        if (showTooltip) {
            window.addEventListener('scroll', updateTooltipPosition);
            window.addEventListener('resize', updateTooltipPosition);
        }

        return () => {
            window.removeEventListener('scroll', updateTooltipPosition);
            window.removeEventListener('resize', updateTooltipPosition);
        };
    }, [showTooltip]);

    return (
        <>
            <div
                ref={triggerRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className="cursor-help inline-flex"
            >
                {children}
            </div>

            {showTooltip && document.body && ReactDOM.createPortal(
                <div
                    className={`fixed ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-500'} text-white p-2 rounded shadow-lg z-[1000] text-xs whitespace-nowrap min-w-min`}
                    style={{
                        top: `${position.top}px`,
                        left: `${position.left}px`,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                    <div className="relative">
                        {text}
                        <div
                            className={`absolute w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent ${theme === 'dark' ? 'border-t-gray-800' : 'border-t-gray-500'}`}
                            style={{ bottom: '-8px', left: '50%', transform: 'translateX(-50%)' }}
                        />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export const ContainerRow: React.FC<ContainerRowProps> = ({
    container,
    isExpanded,
    onToggleExpand,
    onAction,
    actionInProgress,
    isHighlighted,
    highlightTimestamp
}) => {
    // State for log streaming
    const [logs, setLogs] = useState('');
    const [showLogs, setShowLogs] = useState(() => {
        try {
            // Initialize from localStorage on component mount
            const saved = localStorage.getItem(`${LOGS_STORAGE_KEY_PREFIX}${container.id}`);
            return saved === 'true';
        } catch (err) {
            logger.error('Failed to load log view state from localStorage:', err instanceof Error ? err : new Error(String(err)));
            return false;
        }
    });
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [isStreamActive, setIsStreamActive] = useState(false);
    const [highlightActive, setHighlightActive] = useState(isHighlighted || false);

    // Create stable refs to track state across renders
    const showLogsRef = useRef(showLogs);
    const streamActiveRef = useRef(false);
    const { theme } = useTheme();

    // Update refs when state changes
    useEffect(() => {
        showLogsRef.current = showLogs;
    }, [showLogs]);

    useEffect(() => {
        streamActiveRef.current = isStreamActive;
    }, [isStreamActive]);

    // Handle highlight effect
    useEffect(() => {
        if (isHighlighted && highlightTimestamp) {
            // Activate highlight
            setHighlightActive(true);

            // Deactivate highlight after 2 seconds
            const timer = setTimeout(() => {
                setHighlightActive(false);
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [isHighlighted, highlightTimestamp]);

    // Save log view state to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem(`${LOGS_STORAGE_KEY_PREFIX}${container.id}`, showLogs.toString());
        } catch (err) {
            logger.error('Failed to save log view state to localStorage:', err instanceof Error ? err : new Error(String(err)));
        }
    }, [showLogs, container.id]);

    // Ensure UI state is consistent with showLogs state
    useEffect(() => {
        // If logs should be shown but the container isn't expanded, expand it
        if (showLogs && !isExpanded) {
            onToggleExpand();
        }
    }, [showLogs, isExpanded, onToggleExpand]);

    const { startLogStream, stopLogStream } = useWebSocket({
        onLogUpdate: (containerId, log) => {
            if (containerId === container.id && showLogsRef.current) {
                // Log the update for debugging
                logger.debug('Updating logs in ContainerRow:', {
                    containerId,
                    logLength: log.length,
                    currentLogsLength: logs.length,
                    lineCount: (log.match(/\n/g) || []).length + 1
                });

                // Use a functional update to avoid closure issues
                // This is more efficient than capturing the previous logs in the closure
                setLogs(prevLogs => {
                    // Limit log size to prevent performance issues with very large logs
                    // Keep only the last 5000 lines
                    const combinedLogs = prevLogs + log;
                    const lines = combinedLogs.split('\n');
                    if (lines.length > 5000) {
                        return lines.slice(lines.length - 5000).join('\n');
                    }
                    return combinedLogs;
                });

                // Ensure streaming state is active
                if (!isStreamActive) {
                    setIsStreamActive(true);
                    setIsLoadingLogs(false);
                    logger.info('Log stream became active', { containerId });
                }
            }
        },
        onError: (error) => {
            logger.error('Error streaming logs:', new Error(error));
            console.error('Failed to stream logs:', error);
            setIsLoadingLogs(false);

            // Try to restart the stream if it fails
            if (showLogsRef.current && streamActiveRef.current) {
                logger.info('Attempting to restart log stream after error', { containerId: container.id });
                setTimeout(() => {
                    if (showLogsRef.current) {
                        startLogStream(container.id);
                    }
                }, 2000); // Wait 2 seconds before trying to reconnect
            }
        },
        enabled: true // Always keep WebSocket connection enabled
    });

    // Start log streaming immediately when component mounts if logs should be shown
    useEffect(() => {
        if (showLogs) {
            handleViewLogs(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Start or stop log streaming based on showLogs state
    useEffect(() => {
        // When logs become visible
        if (showLogs && !streamActiveRef.current) {
            streamActiveRef.current = true;
            logger.info('Starting log stream due to showLogs change', { containerId: container.id });
            startLogStream(container.id);
            setIsStreamActive(true);
        }

        // Cleanup function will handle the case when logs are hidden
        return () => {
            if (!showLogs && streamActiveRef.current) {
                streamActiveRef.current = false;
                stopLogStream(container.id);
                setIsStreamActive(false);
                logger.info('Log stream inactive due to showLogs change', { containerId: container.id });
            }
        };
    }, [showLogs, container.id, startLogStream, stopLogStream]);

    // Cleanup when component unmounts
    useEffect(() => {
        return () => {
            if (streamActiveRef.current) {
                stopLogStream(container.id);
                logger.info('Log stream stopped due to component unmount', { containerId: container.id });
            }
        };
    }, [container.id, stopLogStream]);

    const handleCloseLogs = useCallback(() => {
        stopLogStream(container.id);
        setShowLogs(false);
        streamActiveRef.current = false;
        setIsStreamActive(false);
        logger.info('Logs closed by user', { containerId: container.id });
    }, [container.id, stopLogStream]);

    const handleViewLogs = useCallback(async (isRestoring: boolean = false) => {
        if (showLogs && !isRestoring) {
            // Stop streaming when closing logs view
            stopLogStream(container.id);
            setShowLogs(false);
            streamActiveRef.current = false;
            setIsStreamActive(false);
            return;
        }

        try {
            logger.info('Fetching container logs', { containerId: container.id });
            setIsLoadingLogs(true);

            if (!isExpanded) {
                onToggleExpand();
            }

            if (!isRestoring) {
                setShowLogs(true);
            }

            // Fetch initial logs via API
            const response = await fetch(`${config.API_URL}/api/containers/${container.id}/logs`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch logs');
            }

            // Set the initial logs
            setLogs(data.data.logs || '');

            // Start real-time streaming
            streamActiveRef.current = true;
            startLogStream(container.id);
            setIsStreamActive(true);

            logger.info('Successfully fetched initial logs and started streaming', {
                containerId: container.id,
                initialLogsLength: data.data.logs ? data.data.logs.length : 0
            });

        } catch (err) {
            logger.error('Failed to fetch container logs', err instanceof Error ? err : new Error(String(err)), {
                containerId: container.id
            });
            console.error('Failed to fetch logs:', err);
            if (isRestoring) {
                setShowLogs(false);
            }
            setIsStreamActive(false);
        } finally {
            setIsLoadingLogs(false);
        }
    }, [container.id, isExpanded, onToggleExpand, startLogStream, stopLogStream, showLogs]);

    const handleAction = async (action: string) => {
        try {
            logger.info(`Performing ${action} action on container ${container.id}`);
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

    // Render the logs section if logs are being shown
    const renderLogs = () => {
        if (!showLogs) return null;

        return (
            <LogContainer
                logs={logs}
                isLoading={isLoadingLogs}
                containerId={container.id}
                onClose={handleCloseLogs}
                isStreamActive={isStreamActive}
            />
        );
    };

    return (
        <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg overflow-hidden mb-4 transition-all duration-300 ${highlightActive ? `${theme === 'dark' ? 'ring-2 ring-blue-500 ring-opacity-75' : 'ring-2 ring-blue-400 ring-opacity-75'} scale-[1.01]` : ''
            }`}>
            <div
                className={`p-4 cursor-pointer`}
                onClick={onToggleExpand}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <Tooltip text={container.status || getStatusDescription(container.state, actionInProgress)}>
                            <div className={`w-3 h-3 rounded-full ${getStatusColor(container.state, actionInProgress)}`} />
                        </Tooltip>
                        <div>
                            <div className="flex items-center space-x-2">
                                <Tooltip text={
                                    (!container.compose_project || container.compose_project === 'Standalone Containers') ?
                                        <>
                                            Container Name
                                            <br />
                                            Created with docker run or docker create command
                                        </> :
                                        <>
                                            Container Name
                                            <br />
                                            Set in docker-compose.yml with container_name: property
                                        </>
                                }>
                                    <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{container.name}</h3>
                                </Tooltip>

                                {container.compose_project && container.compose_project !== 'Standalone Containers' &&
                                    container.compose_service && (
                                        <Tooltip text={<>
                                            Docker Compose Service Name
                                        </>}>
                                            <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                                                {container.compose_service}
                                            </span>
                                        </Tooltip>
                                    )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        {isContainerRunning ? (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAction('stop');
                                }}
                                className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                                disabled={!!actionInProgress}
                                title="Stop container"
                            >
                                <StopIcon className="w-4 h-4 mr-1 text-red-500" />
                                Stop
                            </button>
                        ) : (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAction('start');
                                }}
                                className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                                disabled={!!actionInProgress}
                                title="Start container"
                            >
                                <PlayIcon className="w-4 h-4 mr-1 text-green-500" />
                                Start
                            </button>
                        )}

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleAction('restart');
                            }}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                            disabled={!!actionInProgress}
                            title="Restart container"
                        >
                            <RefreshIcon className="w-4 h-4 mr-1 text-blue-500" />
                            Restart
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleViewLogs();
                            }}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                            disabled={isLoadingLogs}
                            title={`${showLogs ? 'Hide' : 'Show'} logs (docker logs ${container.name})`}
                        >
                            <DocumentIcon className="w-4 h-4 mr-1 text-blue-400" />
                            {showLogs ? 'Hide Logs' : 'Show Logs'}
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleAction('delete');
                            }}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                            disabled={actionInProgress !== null}
                            title={`Delete container (docker rm -f ${container.name})`}
                        >
                            <TrashIcon className={`w-4 h-4 mr-1 text-red-500 ${actionInProgress === 'delete' ? 'animate-pulse' : ''}`} />
                            Delete
                        </button>
                    </div>
                </div>
                <div className="mt-2 space-y-1">
                    <div className="grid grid-cols-[80px_auto] gap-y-1">
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Image:</p>
                        <p><span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                            <HiOutlineTemplate className="mr-1 text-purple-400" />
                            {container.image}
                        </span></p>

                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Status:</p>
                        <p><span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                            <HiOutlineStatusOnline className="mr-1 text-blue-400" />
                            {getStatusText()}
                        </span></p>

                        {container.ports && (
                            <>
                                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Ports:</p>
                                <p><span className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} inline-flex`}>
                                    <PortDisplay portsString={container.ports} />
                                </span></p>
                            </>
                        )}
                    </div>
                </div>
            </div>
            {isExpanded && (
                <div className={`px-4 py-3 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    {/* Render logs if they're being shown */}
                    {showLogs && renderLogs()}
                </div>
            )}
        </div>
    );
};
