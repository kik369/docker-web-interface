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
import { useContainerContext } from '../context/ContainerContext'; // Added
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

import Tooltip from './shared/Tooltip'; // Added import

export const ContainerRow: React.FC<ContainerRowProps> = ({
    container,
    isExpanded,
    onToggleExpand,
    onAction,
    actionInProgress,
    isHighlighted,
    highlightTimestamp
}) => {
    const { state: { areAllLogsOpen } } = useContainerContext(); // Access global state

    // State for log streaming - Renamed showLogs to isLogVisible
    const [logs, setLogs] = useState('');
    const [isLogVisible, setIsLogVisible] = useState(() => { // Renamed
        try {
            // Initialize from localStorage on component mount.
            // The global state (areAllLogsOpen) will be applied by an effect if it differs.
            const saved = localStorage.getItem(`${LOGS_STORAGE_KEY_PREFIX}${container.id}`);
            return saved === 'true';
        } catch (err) {
            logger.error('Failed to load log view state from localStorage:', err instanceof Error ? err : new Error(String(err)));
            return false; // Default to false on error
        }
    });
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [isStreamActive, setIsStreamActive] = useState(false);
    const [highlightActive, setHighlightActive] = useState(isHighlighted || false);
    const [isPaused, setIsPaused] = useState(false);
    const [isInView, setIsInView] = useState(false);

    // Create stable refs to track state across renders
    const isLogVisibleRef = useRef(isLogVisible);
    const actualStreamIsRunning = useRef(false); // Ref to track if the stream is actually running
    const logContainerRef = useRef<HTMLDivElement>(null);
    const logContainerObserver = useRef<IntersectionObserver | null>(null);
    const { theme } = useTheme();

    // Move useWebSocket hook here so startLogStream/stopLogStream are declared before useEffect hooks
    const { startLogStream, stopLogStream } = useWebSocket({
        onLogUpdate: (containerId, log) => {
            if (containerId === container.id && isLogVisibleRef.current) { // Renamed
                // Log the update for debugging
                logger.debug('Updating logs in ContainerRow:', {
                    containerId,
                    logLength: log.length,
                    currentLogsLength: logs.length,
                    lineCount: (log.match(/\n/g) || []).length + 1
                });

                if (isLoadingLogs) {
                    setIsLoadingLogs(false);
                }

                // Use a functional update to avoid closure issues
                // This is more efficient than capturing the previous logs in the closure
                setLogs(prevLogs => {
                    // First check if log is empty to avoid unnecessary processing
                    if (!log) return prevLogs;

                    // Add new log content
                    const combinedLogs = prevLogs + log;

                    // Only process if we might be exceeding the limit (optimization)
                    if (combinedLogs.length > 500000) { // Rough estimate - 100 chars per line * 5000 lines
                        // Split by newline, keep only the last 5000 lines
                        const lines = combinedLogs.split('\n');
                        return lines.slice(Math.max(0, lines.length - 5000)).join('\n');
                    }

                    return combinedLogs;
                });
            }
        },
        onError: (error) => {
            logger.error('Error streaming logs:', new Error(error));
            console.error('Failed to stream logs:', error);
            setIsLoadingLogs(false);

            // Try to restart the stream if it fails
            if (isLogVisibleRef.current && streamActiveRef.current) { // Renamed
                logger.info('Attempting to restart log stream after error', { containerId: container.id });
                setTimeout(() => {
                    if (isLogVisibleRef.current) { // Renamed
                        startLogStream(container.id);
                    }
                }, 2000); // Wait 2 seconds before trying to reconnect
            }
        },
        enabled: true, // Always keep WebSocket connection enabled
        isInView: isInView // Pass visibility state to control update frequency
    });

    // Update refs when state changes
    useEffect(() => {
        isLogVisibleRef.current = isLogVisible;
    }, [isLogVisible]);

    // Effect to synchronize with global areAllLogsOpen state
    useEffect(() => {
        // When areAllLogsOpen changes, update local state and localStorage for this specific container
        // This ensures the row reacts to global commands.
        if (isLogVisible !== areAllLogsOpen) { // Only update if different to avoid loop with local storage effect
             setIsLogVisible(areAllLogsOpen);
             try {
                 localStorage.setItem(`${LOGS_STORAGE_KEY_PREFIX}${container.id}`, areAllLogsOpen.toString());
             } catch (err) {
                 logger.error('Failed to save log view state to localStorage from global sync:', err instanceof Error ? err : new Error(String(err)));
             }
        }
    }, [areAllLogsOpen, container.id]); // isLogVisible removed from deps

    // Set up intersection observer to detect when logs are in/out of viewport
    useEffect(() => {
        if (isLogVisible && logContainerRef.current) { // Renamed showLogs
            // Set up intersection observer to detect when logs are in/out of viewport
            logContainerObserver.current = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        setIsInView(entry.isIntersecting);
                    });
                },
                { threshold: 0.1 } // 10% visibility threshold
            );

            logContainerObserver.current.observe(logContainerRef.current);
        }

        return () => {
            if (logContainerObserver.current) {
                logContainerObserver.current.disconnect();
            }
        };
    }, [isLogVisible]); // Renamed showLogs

    // Pause/resume streaming based on isPaused state - This specific effect is removed, logic merged below.

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
        // This effect ensures that local changes to isLogVisible (e.g., from user interaction)
        // are persisted to localStorage.
        try {
            localStorage.setItem(`${LOGS_STORAGE_KEY_PREFIX}${container.id}`, isLogVisible.toString());
        } catch (err) {
            logger.error('Failed to save log view state to localStorage on local change:', err instanceof Error ? err : new Error(String(err)));
        }
    }, [isLogVisible, container.id]); // Runs when isLogVisible or container.id changes.

    // Toggle log display (handles local user interaction)
    const handleToggleLogs = useCallback(() => {
        // This updates the local isLogVisible state.
        // The useEffect watching isLogVisible will then handle localStorage update & stream control.
        setIsLogVisible(prev => !prev);
    }, []); // No dependencies needed as it only uses setIsLogVisible

    // Effect for managing log stream when isLogVisible or isPaused changes
    useEffect(() => {
        const shouldStreamBeActive = isLogVisible && !isPaused;

        if (shouldStreamBeActive) {
            if (!actualStreamIsRunning.current) {
                setIsLoadingLogs(true);
                setLogs(''); // Clear logs when starting a new viewing session or resuming if logs were cleared on hide
                startLogStream(container.id);
                actualStreamIsRunning.current = true;
                setIsStreamActive(true); // Update UI state reflecting intent
            }
        } else { // Not visible or is paused
            if (actualStreamIsRunning.current) {
                stopLogStream(container.id);
                actualStreamIsRunning.current = false;
                setIsStreamActive(false); // Update UI state reflecting intent
                if (!isLogVisible) { // Only clear logs if hiding, not if pausing
                    setLogs('');
                }
            }
        }
    }, [isLogVisible, isPaused, container.id, startLogStream, stopLogStream]);

    // Cleanup when component unmounts
    useEffect(() => {
        return () => {
            if (actualStreamIsRunning.current) { // Check if stream was actually running
                stopLogStream(container.id);
                logger.info('Log stream stopped due to component unmount', { containerId: container.id });
            }
        };
    }, [container.id, stopLogStream]);

    const handleCloseLogs = useCallback(() => {
        // This function is called by LogContainer child, effectively a manual toggle off for this row.
        // It updates the local isLogVisible state.
        // The useEffect watching isLogVisible will then handle localStorage update & stream control.
        setIsLogVisible(false);
    }, []); // No dependencies needed as it only uses setIsLogVisible

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
            <div ref={logContainerRef}>
                <LogContainer
                    logs={logs}
                    isLoading={isLoadingLogs}
                    containerId={container.id}
                    containerName={container.name}
                    onClose={handleCloseLogs}
                    isStreamActive={isStreamActive}
                    isPaused={isPaused}
                    onPauseToggle={() => setIsPaused(prev => !prev)}
                />
            </div>
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
                                handleToggleLogs(); // This now handles local state
                            }}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                            disabled={isLoadingLogs}
                            title={isLogVisible ? "Hide logs" : "Show logs"} // Renamed
                        >
                            <DocumentIcon className={`h-4 w-4 mr-1.5 ${isLogVisible ? 'text-blue-400' : 'text-gray-400'}`} /> {/* Renamed */}
                            <span className="hidden sm:inline">{isLogVisible ? 'Hide Logs' : 'Show Logs'}</span> {/* Renamed */}
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
            {isLogVisible && ( // Renamed
                <div className={`px-4 py-3 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    {renderLogs()}
                </div>
            )}
        </div>
    );
};
