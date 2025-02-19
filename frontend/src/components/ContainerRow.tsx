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
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(container.state)}`} />
                        <h3 className="text-lg font-semibold">{container.name}</h3>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={handleViewLogs}
                            className="p-2 text-gray-500 hover:text-gray-700"
                            disabled={isLoadingLogs}
                        >
                            <HiDocument className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => handleAction('start')}
                            className="p-2 text-gray-500 hover:text-green-600"
                            disabled={isActionLoading !== null || container.state === 'running'}
                        >
                            <HiPlay className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => handleAction('stop')}
                            className="p-2 text-gray-500 hover:text-red-600"
                            disabled={isActionLoading !== null || container.state !== 'running'}
                        >
                            <HiStop className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => handleAction('restart')}
                            className="p-2 text-gray-500 hover:text-blue-600"
                            disabled={isActionLoading !== null}
                        >
                            <HiRefresh className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => handleAction('rebuild')}
                            className="p-2 text-gray-500 hover:text-purple-600"
                            disabled={isActionLoading !== null}
                        >
                            <HiCog className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="mt-2">
                    <p className="text-sm text-gray-500">Image: {container.image}</p>
                    <p className="text-sm text-gray-500">Status: {container.status}</p>
                    {container.ports && (
                        <p className="text-sm text-gray-500">Ports: {container.ports}</p>
                    )}
                </div>
            </div>
            {showLogs && (
                <div className="px-4 pb-4">
                    <div className="bg-gray-100 p-4 rounded">
                        <pre className="text-sm whitespace-pre-wrap">{logs}</pre>
                    </div>
                </div>
            )}
        </div>
    );
};
