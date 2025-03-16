/// <reference types="react" />
import React, { useRef, useEffect, useCallback, useState } from 'react';
import ReactDOM from 'react-dom';
import { IconBaseProps } from 'react-icons';
import { HiPlay, HiStop, HiRefresh, HiTrash, HiOutlineTemplate, HiOutlineStatusOnline, HiOutlineInformationCircle, HiOutlineDocumentText } from 'react-icons/hi';
import { HiOutlineDesktopComputer, HiOutlineServer } from 'react-icons/hi';
import { ContainerRowProps } from '../types/docker';
import { logger } from '../services/logging';
import { config } from '../config';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTheme } from '../context/ThemeContext';
import LogContainer from './LogContainer';
import { CopyableText } from './CopyableText';

// Create wrapper components for icons
const DocumentIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiOutlineDocumentText {...props} />
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
        case 'starting':
            return 'bg-yellow-500 animate-pulse';
        case 'stopping':
            return 'bg-orange-500 animate-pulse';
        default:
            return 'bg-gray-500';
    }
};

// Get a human-readable description of the container state
const getStatusDescription = (state: string | undefined, actionInProgress: string | null): string => {
    if (actionInProgress) {
        switch (actionInProgress) {
            case 'stop':
                return 'Container is being stopped';
            case 'start':
                return 'Container is being started';
            case 'restart':
                return 'Container is being restarted';
            case 'rebuild':
                return 'Container is being rebuilt';
            default:
                return `Container is being ${actionInProgress}ed`;
        }
    }

    const stateLower = (state || '').toLowerCase();
    switch (stateLower) {
        case 'running':
            return 'Container is running';
        case 'paused':
            return 'Container is paused';
        case 'exited':
        case 'stopped':
            return 'Container is stopped';
        case 'dead':
            return 'Container is in a dead state';
        case 'created':
            return 'Container is created but not started';
        case 'restarting':
            return 'Container is restarting';
        case 'starting':
            return 'Container is starting';
        case 'stopping':
            return 'Container is stopping';
        default:
            return `Container state: ${state}`;
    }
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
                                <CopyableText text={hostPort}>
                                    <Tooltip text="Host Port (your computer)">
                                        <span className="flex items-center mr-1">
                                            <HiOutlineDesktopComputer className="mr-1 text-blue-300" />
                                            {hostPort}
                                        </span>
                                    </Tooltip>
                                </CopyableText>
                                <span className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mx-1`}>→</span>
                                <CopyableText text={port}>
                                    <Tooltip text="Container Port (inside Docker)">
                                        <span className="flex items-center">
                                            <HiOutlineServer className="mr-1 text-green-300" />
                                            {port}
                                        </span>
                                    </Tooltip>
                                </CopyableText>
                            </>
                        ) : (
                            <CopyableText text={port}>
                                <Tooltip text="Container Port (inside Docker)">
                                    <span className="flex items-center">
                                        <HiOutlineServer className="mr-1 text-green-400" />
                                        {port}
                                    </span>
                                </Tooltip>
                            </CopyableText>
                        )}
                        {protocol && (
                            <Tooltip text={
                                protocol.toLowerCase() === 'tcp' ?
                                    "TCP (Transmission Control Protocol): Reliable, connection-oriented protocol that ensures data delivery." :
                                    protocol.toLowerCase() === 'udp' ?
                                        "UDP (User Datagram Protocol): Faster, connectionless protocol used for speed over reliability." :
                                        `${protocol} Protocol`
                            }>
                                <div className="inline-flex items-center ml-1">
                                    <span className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{protocol}</span>
                                    <HiOutlineInformationCircle className={`inline-block ml-1 ${theme === 'dark' ? 'text-gray-400 hover:text-blue-300' : 'text-gray-500 hover:text-blue-400'}`} />
                                </div>
                            </Tooltip>
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
                top: rect.top - 10,
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
                    className={`fixed ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-500'} text-white p-2 rounded
                    shadow-xl z-[1000] text-xs whitespace-nowrap min-w-min
                    ${theme === 'dark' ? 'shadow-black/50 border border-gray-700' : 'shadow-gray-700/50'}
                    backdrop-blur-sm backdrop-filter`}
                    style={{
                        top: `${position.top}px`,
                        left: `${position.left}px`,
                        transform: 'translate(-50%, -100%)',
                        boxShadow: theme === 'dark'
                            ? '0 4px 8px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)'
                            : '0 4px 8px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15)'
                    }}
                >
                    <div className="relative">
                        {text}
                        <div
                            className={`absolute w-0 h-0 border-l-6 border-r-6 border-t-6 border-transparent
                            ${theme === 'dark' ? 'border-t-gray-800' : 'border-t-gray-500'}`}
                            style={{
                                bottom: '-12px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                filter: theme === 'dark' ? 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5))' : 'drop-shadow(0 2px 2px rgba(0, 0, 0, 0.25))'
                            }}
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
    }, [container.id, startLogStream, stopLogStream, showLogs]);

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

        // When no action is in progress, show the appropriate status based on state
        const stateLower = (container.state || '').toLowerCase();
        switch (stateLower) {
            case 'running':
                return 'Running';
            case 'paused':
                return 'Paused';
            case 'exited':
            case 'stopped':
                return 'Exited';
            case 'dead':
                return 'Dead';
            case 'created':
                return 'Created';
            case 'restarting':
                return 'Restarting...';
            case 'starting':
                return 'Starting...';
            case 'stopping':
                return 'Stopping...';
            default:
                // Fall back to the container status if state doesn't match known values
                return container.status || 'Unknown';
        }
    };

    // Determine if the container is actually running based on both state and status
    const isContainerRunning = container.state === 'running';

    // Render the logs section if logs are being shown
    const renderLogs = () => {
        return (
            <LogContainer
                logs={logs}
                isLoading={isLoadingLogs}
                containerId={container.id}
                containerName={container.name}
                onClose={handleCloseLogs}
                isStreamActive={isStreamActive}
            />
        );
    };

    return (
        <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg overflow-hidden transition-all duration-300 border border-opacity-10 ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'} shadow-custom ${highlightActive
            ? `${theme === 'dark' ? 'ring-2 ring-blue-500 ring-opacity-75' : 'ring-2 ring-blue-400 ring-opacity-75'} scale-[1.01] animate-glow-pulse`
            : ''
            }`}
            style={{
                boxShadow: theme === 'dark'
                    ? '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 2px 5px 0 rgba(0, 0, 0, 0.2), 0 1px 1px 0 rgba(0, 0, 0, 0.1)'
                    : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 2px 5px 0 rgba(0, 0, 0, 0.08), 0 1px 1px 0 rgba(0, 0, 0, 0.05)'
            }}
        >
            <div
                className={`p-3`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <Tooltip text={container.status || getStatusDescription(container.state, actionInProgress)}>
                            <div className={`w-3 h-3 rounded-full ${getStatusColor(container.state, actionInProgress)}`} />
                        </Tooltip>
                        <div>
                            <div className="flex items-center space-x-2">
                                <CopyableText text={container.name}>
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
                                        <h3 className={`text-lg font-semibold font-mono ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{container.name}</h3>
                                    </Tooltip>
                                </CopyableText>

                                {container.compose_project && container.compose_project !== 'Standalone Containers' &&
                                    container.compose_service && (
                                        <CopyableText text={container.compose_service}>
                                            <Tooltip text={<>
                                                Docker Compose Service Name
                                            </>}>
                                                <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                                                    {container.compose_service}
                                                </span>
                                            </Tooltip>
                                        </CopyableText>
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
                                className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                                disabled={!!actionInProgress}
                                title="Stop container"
                            >
                                <StopIcon className="w-4 h-4 mr-1.5 text-red-400" />
                                Stop
                            </button>
                        ) : (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAction('start');
                                }}
                                className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                                disabled={!!actionInProgress}
                                title="Start container"
                            >
                                <PlayIcon className="w-4 h-4 mr-1.5 text-green-400" />
                                Start
                            </button>
                        )}

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleAction('restart');
                            }}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                            disabled={!!actionInProgress}
                            title="Restart container"
                        >
                            <RefreshIcon className="w-4 h-4 mr-1.5 text-blue-400" />
                            Restart
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleViewLogs();
                            }}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                            disabled={isLoadingLogs}
                            title={`${showLogs ? 'Hide' : 'Show'} logs (docker logs ${container.name})`}
                        >
                            <DocumentIcon className="w-4 h-4 mr-1.5 text-blue-300" />
                            {showLogs ? 'Hide Logs' : 'Show Logs'}
                        </button>

                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleAction('delete');
                            }}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                            disabled={actionInProgress !== null}
                            title={`Delete container (docker rm -f ${container.name})`}
                        >
                            <TrashIcon className={`w-4 h-4 mr-1.5 text-red-400 ${actionInProgress === 'delete' ? 'animate-pulse' : ''}`} />
                            Delete
                        </button>
                    </div>
                </div>
                <div className="mt-2 space-y-1">
                    <div className="grid grid-cols-[80px_auto] gap-y-1">
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Image:</p>
                        <p><CopyableText text={container.image}>
                            <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                                <HiOutlineTemplate className="mr-1 text-purple-300" />
                                {container.image}
                            </span>
                        </CopyableText></p>

                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Status:</p>
                        <p><span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono`}>
                            <HiOutlineStatusOnline className="mr-1 text-blue-300" />
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
            {showLogs && (
                <div className={`px-4 py-3 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    {renderLogs()}
                </div>
            )}
        </div>
    );
};
