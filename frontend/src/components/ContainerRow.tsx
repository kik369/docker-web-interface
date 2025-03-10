/// <reference types="react" />
import React, { useRef, useEffect, useCallback, useState } from 'react';
import ReactDOM from 'react-dom';
import { IconBaseProps } from 'react-icons';
import { HiDocument, HiPlay, HiStop, HiRefresh, HiCog, HiTrash } from 'react-icons/hi';
import { HiOutlineInformationCircle, HiOutlineDesktopComputer, HiOutlineServer } from 'react-icons/hi';
import { HiOutlineTemplate, HiOutlineStatusOnline, HiOutlineChartBar } from 'react-icons/hi';
import { ContainerRowProps } from '../types/docker';
import { logger } from '../services/logging';
import { config } from '../config';
import { useWebSocket } from '../hooks/useWebSocket';
import { ContainerCpuStats } from './ContainerCpuStats';

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
            return 'bg-green-400';
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
    if (!portsString) return null;

    const portMappings = portsString.split(', ');

    return (
        <div className="flex flex-wrap gap-2">
            {portMappings.map((mapping, index) => {
                const [hostPort, containerPort] = mapping.split('->');

                // Check if the port includes protocol info (tcp/udp)
                const [port, protocol] = containerPort ? containerPort.split('/') : [hostPort, ''];

                return (
                    <div key={index} className="inline-flex items-center bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs">
                        {containerPort ? (
                            <>
                                <span className="flex items-center mr-1" title="Host Port (your computer)">
                                    <HiOutlineDesktopComputer className="mr-1 text-blue-400" />
                                    {hostPort}
                                </span>
                                <span className="text-gray-400 mx-1">→</span>
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
                                <span className="text-xs text-gray-400">{protocol}</span>
                                <HiOutlineInformationCircle className="inline-block ml-1 text-gray-400 hover:text-blue-400 cursor-help" />
                                <div className="absolute hidden group-hover:block bottom-full left-1/2 transform -translate-x-1/2 bg-gray-800 text-white p-2 rounded shadow-lg w-64 z-10 text-xs">
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
                    className="fixed bg-gray-800 text-white p-2 rounded shadow-lg z-[1000] text-xs whitespace-nowrap min-w-min"
                    style={{
                        top: `${position.top}px`,
                        left: `${position.left}px`,
                        transform: 'translate(-50%, -100%)'
                    }}
                >
                    <div className="relative">
                        {text}
                        <div
                            className="absolute w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-gray-800"
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
    const [showCpuStats, setShowCpuStats] = useState<boolean>(false);
    const [isLoadingLogs, setIsLoadingLogs] = React.useState(false);
    const logContainerRef = useRef<HTMLPreElement>(null);
    const showLogsRef = useRef(showLogs);

    useEffect(() => {
        showLogsRef.current = showLogs;
    }, [showLogs]);

    // Save log view state to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem(`${LOGS_STORAGE_KEY_PREFIX}${container.id}`, showLogs.toString());
        } catch (err) {
            logger.error('Failed to save log view state to localStorage:', err instanceof Error ? err : new Error(String(err)));
        }
    }, [showLogs, container.id]);

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
        },
        enabled: showLogs // Only enable WebSocket when logs are being viewed
    });

    const handleViewLogs = useCallback(async (isRestoring: boolean = false) => {
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
    }, [container.id, isExpanded, onToggleExpand, setLogs, setShowLogs, showLogs, startLogStream]);

    // Load logs if showLogs is true on mount or after state restoration
    useEffect(() => {
        if (showLogsRef.current) {
            handleViewLogs(true);
        }
    }, [handleViewLogs]); // Now we can safely include handleViewLogs

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

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="p-4">
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
                                    <h3 className="text-lg font-semibold text-white">{container.name}</h3>
                                </Tooltip>

                                {container.compose_project && container.compose_project !== 'Standalone Containers' &&
                                    container.compose_service && (
                                        <Tooltip text={<>
                                            Docker Compose Service Name
                                        </>}>
                                            <span className="inline-flex items-center bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                                                {container.compose_service}
                                            </span>
                                        </Tooltip>
                                    )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => handleViewLogs()}
                            className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
                            disabled={isLoadingLogs}
                            title={`Show logs (docker logs ${container.name})`}
                        >
                            <DocumentIcon className="w-4 h-4 mr-1 text-blue-400" />
                            Show Logs
                        </button>
                        <button
                            onClick={() => setShowCpuStats(!showCpuStats)}
                            className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
                            disabled={container.state !== 'running'}
                            title={container.state === 'running' ? "Show CPU usage" : "Container must be running to show CPU usage"}
                        >
                            <HiOutlineChartBar className="w-4 h-4 mr-1 text-blue-400" />
                            {showCpuStats ? 'Hide CPU' : 'Show CPU'}
                        </button>
                        {isContainerRunning ? (
                            <button
                                onClick={() => handleAction('stop')}
                                className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
                                disabled={actionInProgress !== null}
                                title={`Stop container (docker stop ${container.name})`}
                            >
                                <StopIcon className={`w-4 h-4 mr-1 text-red-400 ${actionInProgress === 'stop' ? 'animate-pulse' : ''}`} />
                                Stop
                            </button>
                        ) : (
                            <button
                                onClick={() => handleAction('start')}
                                className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
                                disabled={actionInProgress !== null}
                                title={`Start container (docker start ${container.name})`}
                            >
                                <PlayIcon className={`w-4 h-4 mr-1 text-green-400 ${actionInProgress === 'start' ? 'animate-pulse' : ''}`} />
                                Start
                            </button>
                        )}
                        <button
                            onClick={() => handleAction('restart')}
                            className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
                            disabled={actionInProgress !== null}
                            title={`Restart container (docker restart ${container.name})`}
                        >
                            <RefreshIcon className={`w-4 h-4 mr-1 text-blue-400 ${actionInProgress === 'restart' ? 'animate-pulse' : ''}`} />
                            Restart
                        </button>
                        <button
                            onClick={() => handleAction('rebuild')}
                            className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
                            disabled={actionInProgress !== null}
                            title={`Rebuild container (docker pull ${container.image} && docker run ...)`}
                        >
                            <CogIcon className={`w-4 h-4 mr-1 text-purple-400 ${actionInProgress === 'rebuild' ? 'animate-pulse' : ''}`} />
                            Rebuild
                        </button>
                        <button
                            onClick={() => handleAction('delete')}
                            className="inline-flex items-center bg-gray-700 rounded px-2 py-1 text-xs text-white hover:bg-gray-600 transition-colors"
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
                        <p className="text-sm text-gray-400">Image:</p>
                        <p><span className="inline-flex items-center bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                            <HiOutlineTemplate className="mr-1 text-purple-400" />
                            {container.image}
                        </span></p>

                        <p className="text-sm text-gray-400">Status:</p>
                        <p><span className="inline-flex items-center bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                            <HiOutlineStatusOnline className="mr-1 text-blue-400" />
                            {getStatusText()}
                        </span></p>

                        {container.ports && (
                            <>
                                <p className="text-sm text-gray-400">Ports:</p>
                                <p><span className="text-gray-300 inline-flex">
                                    <PortDisplay portsString={container.ports} />
                                </span></p>
                            </>
                        )}
                    </div>
                </div>
            </div>
            {showLogs && (
                <div className="bg-gray-900 p-4 rounded-lg mt-2">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold text-white">Container Logs</h3>
                        <button
                            onClick={() => handleViewLogs()}
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
                        </pre>
                    )}
                </div>
            )}

            {showCpuStats && (
                <ContainerCpuStats
                    containerId={container.id}
                    isVisible={showCpuStats}
                />
            )}
        </div>
    );
};
