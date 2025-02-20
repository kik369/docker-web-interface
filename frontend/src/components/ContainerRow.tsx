import React, { useState } from 'react';
import { HiDocument, HiPlay, HiStop, HiRefresh, HiCog } from 'react-icons/hi';
import { ContainerRowProps } from '../types/docker';
import { logger } from '../services/logging';
import { config } from '../config';

const getStatusColor = (state: string | undefined): string => {
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
    onAction
}) => {
    const [logs, setLogs] = useState<string>('');
    const [showLogs, setShowLogs] = useState(false);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState<string | null>(null);

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
            setIsActionLoading(action);
            await onAction(container.id, action);
        } catch (err) {
            logger.error(`Failed to perform ${action} action`, err instanceof Error ? err : undefined, {
                containerId: container.id,
                action
            });
            console.error(`Failed to ${action} container:`, err);
        } finally {
            setIsActionLoading(null);
        }
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
            <div className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(container.state)}`} />
                        <div>
                            <div className="flex items-center space-x-2">
                                <h3 className="text-lg font-semibold text-white">{container.name}</h3>
                                {container.compose_service && container.compose_service !== container.name && (
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
                            <HiDocument className="w-5 h-5" />
                        </button>
                        {container.state === 'running' ? (
                            <button
                                onClick={() => handleAction('stop')}
                                className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                                disabled={isActionLoading !== null}
                                title={`Stop container (docker stop ${container.name})`}
                            >
                                <HiStop className="w-5 h-5" />
                            </button>
                        ) : (
                            <button
                                onClick={() => handleAction('start')}
                                className="p-2 text-gray-400 hover:text-green-400 transition-colors"
                                disabled={isActionLoading !== null}
                                title={`Start container (docker start ${container.name})`}
                            >
                                <HiPlay className="w-5 h-5" />
                            </button>
                        )}
                        <button
                            onClick={() => handleAction('restart')}
                            className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
                            disabled={isActionLoading !== null}
                            title={`Restart container (docker restart ${container.name})`}
                        >
                            <HiRefresh className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => handleAction('rebuild')}
                            className="p-2 text-gray-400 hover:text-purple-400 transition-colors"
                            disabled={isActionLoading !== null}
                            title={`Rebuild container (docker pull ${container.image} && docker run ...)`}
                        >
                            <HiCog className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="mt-2 space-y-1">
                    <p className="text-sm text-gray-400">Status: <span className="text-gray-300">{container.status}</span></p>
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
