/// <reference types="react" />
import React from 'react';
import { IconBaseProps } from 'react-icons';
import { HiDocument, HiPlay, HiStop, HiRefresh, HiCog } from 'react-icons/hi';
import { ContainerRowProps } from '../types/docker';
import { logger } from '../services/logging';
import { config } from '../config';

// Create wrapper components for icons
const DocumentIcon = (props: IconBaseProps): JSX.Element => <HiDocument {...props} />;
const PlayIcon = (props: IconBaseProps): JSX.Element => <HiPlay {...props} />;
const StopIcon = (props: IconBaseProps): JSX.Element => <HiStop {...props} />;
const RefreshIcon = (props: IconBaseProps): JSX.Element => <HiRefresh {...props} />;
const CogIcon = (props: IconBaseProps): JSX.Element => <HiCog {...props} />;

const getStatusColor = (state: string | undefined, isActionLoading: string | null): string => {
    if (isActionLoading) {
        return 'bg-yellow-500 animate-pulse';
    }

    const stateLower = (state || '').toLowerCase();

    if (stateLower === 'running') {
        return 'bg-green-500';
    } else if (stateLower === 'paused') {
        return 'bg-yellow-500';
    } else if (stateLower === 'exited' || stateLower === 'stopped' || stateLower === 'dead') {
        return 'bg-red-500';
    } else if (stateLower === 'created') {
        return 'bg-blue-500';
    }
    return 'bg-gray-500';
};

export const ContainerRow: React.FC<ContainerRowProps> = ({
    container,
    isExpanded,
    onToggleExpand,
    onAction,
    actionInProgress
}) => {
    const [logs, setLogs] = React.useState<string>('');
    const [showLogs, setShowLogs] = React.useState(false);
    const [isLoadingLogs, setIsLoadingLogs] = React.useState(false);

    const handleViewLogs = async () => {
        if (showLogs) {
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
            setShowLogs(true);
            logger.info('Successfully fetched container logs', { containerId: container.id });
        } catch (err) {
            logger.error('Failed to fetch container logs', err instanceof Error ? err : undefined, {
                containerId: container.id
            });
            console.error('Failed to fetch logs:', err);
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
    };

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
                            onClick={handleViewLogs}
                            className="p-2 text-gray-400 hover:text-white transition-colors"
                            disabled={isLoadingLogs}
                            title={`Show logs (docker logs ${container.name})`}
                        >
                            <DocumentIcon className="w-5 h-5" />
                        </button>
                        {container.state === 'running' ? (
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
                        <pre className="text-sm text-gray-300 whitespace-pre-wrap">{logs}</pre>
                    </div>
                </div>
            )}
        </div>
    );
};
