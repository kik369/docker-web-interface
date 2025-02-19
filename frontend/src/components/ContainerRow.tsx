import React, { useState } from 'react';
import { HiInformationCircle, HiDocument, HiPlay, HiStop, HiRefresh, HiCog } from 'react-icons/hi';
import { Transition, Popover } from '@headlessui/react';
import { ContainerRowProps } from '../types/docker';
import { useContainers } from '../hooks/useContainers';

const getStatusColor = (state: string | undefined, status: string | undefined): string => {
    const stateLower = (state || '').toLowerCase();
    const statusLower = (status || '').toLowerCase();

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
}) => {
    const [logs, setLogs] = useState<string>('');
    const [showLogs, setShowLogs] = useState(false);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
    const { fetchContainerLogs, startContainer, stopContainer, restartContainer, rebuildContainer } = useContainers();

    const handleViewLogs = async () => {
        if (showLogs) {
            setShowLogs(false);
            setLogs('');
            return;
        }

        try {
            setIsLoadingLogs(true);
            const containerLogs = await fetchContainerLogs(container.id);
            setLogs(containerLogs);
            setShowLogs(true);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
            setLogs('Failed to fetch container logs');
        } finally {
            setIsLoadingLogs(false);
        }
    };

    const handleAction = async (action: string, actionFn: (id: string) => Promise<string>) => {
        try {
            setIsActionLoading(action);
            await actionFn(container.id);
        } catch (error) {
            console.error(`Failed to ${action} container:`, error);
        } finally {
            setIsActionLoading(null);
        }
    };

    const isRunning = (container.state || '').toLowerCase() === 'running';
    const containerState = container.state || 'unknown';
    const containerStatus = container.status || '';

    return (
        <>
            <tr className="hover:bg-gray-700/50">
                <td className="p-3 text-sm text-white flex items-center space-x-2">
                    <Popover className="relative">
                        <Popover.Button className="focus:outline-none">
                            <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(container.state, container.status)}`} />
                        </Popover.Button>
                        <Transition
                            enter="transition duration-100 ease-out"
                            enterFrom="transform scale-95 opacity-0"
                            enterTo="transform scale-100 opacity-100"
                            leave="transition duration-75 ease-out"
                            leaveFrom="transform scale-100 opacity-100"
                            leaveTo="transform scale-95 opacity-0"
                        >
                            <Popover.Panel className="absolute z-10 px-2 py-1 text-xs bg-gray-800 text-white rounded shadow-lg mt-1">
                                <div>
                                    <span className="font-semibold">State:</span> {containerState}
                                </div>
                                {containerStatus && (
                                    <div>
                                        <span className="font-semibold">Status:</span> {containerStatus}
                                    </div>
                                )}
                            </Popover.Panel>
                        </Transition>
                    </Popover>
                    <span>{container.name}</span>
                </td>
                <td className="p-3 text-sm">
                    <span
                        className={`px-2 py-1 rounded-full text-xs ${isRunning
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-yellow-500/20 text-yellow-300'
                            }`}
                    >
                        {containerState}{containerStatus ? ` (${containerStatus})` : ''}
                    </span>
                </td>
                <td className="p-3 text-sm space-x-2">
                    <button
                        onClick={onToggleExpand}
                        className="text-blue-400 hover:text-blue-300 focus:outline-none inline-flex items-center space-x-1"
                    >
                        <HiInformationCircle className="h-5 w-5" />
                        <span>{isExpanded ? 'Hide Details' : 'Show Details'}</span>
                    </button>
                    <button
                        onClick={handleViewLogs}
                        className="text-blue-400 hover:text-blue-300 focus:outline-none inline-flex items-center space-x-1"
                        disabled={isLoadingLogs}
                    >
                        <HiDocument className="h-5 w-5" />
                        <span>{isLoadingLogs ? 'Loading...' : showLogs ? 'Hide Logs' : 'Show Logs'}</span>
                    </button>
                    {!isRunning && (
                        <button
                            onClick={() => handleAction('start', startContainer)}
                            className="text-green-400 hover:text-green-300 focus:outline-none inline-flex items-center space-x-1"
                            disabled={!!isActionLoading}
                        >
                            <HiPlay className="h-5 w-5" />
                            <span>{isActionLoading === 'start' ? 'Starting...' : 'Start'}</span>
                        </button>
                    )}
                    {isRunning && (
                        <button
                            onClick={() => handleAction('stop', stopContainer)}
                            className="text-red-400 hover:text-red-300 focus:outline-none inline-flex items-center space-x-1"
                            disabled={!!isActionLoading}
                        >
                            <HiStop className="h-5 w-5" />
                            <span>{isActionLoading === 'stop' ? 'Stopping...' : 'Stop'}</span>
                        </button>
                    )}
                    <button
                        onClick={() => handleAction('restart', restartContainer)}
                        className="text-yellow-400 hover:text-yellow-300 focus:outline-none inline-flex items-center space-x-1"
                        disabled={!!isActionLoading}
                    >
                        <HiRefresh className="h-5 w-5" />
                        <span>{isActionLoading === 'restart' ? 'Restarting...' : 'Restart'}</span>
                    </button>
                    <button
                        onClick={() => handleAction('rebuild', rebuildContainer)}
                        className="text-purple-400 hover:text-purple-300 focus:outline-none inline-flex items-center space-x-1"
                        disabled={!!isActionLoading}
                    >
                        <HiCog className="h-5 w-5" />
                        <span>{isActionLoading === 'rebuild' ? 'Rebuilding...' : 'Rebuild'}</span>
                    </button>
                </td>
            </tr>
            {isExpanded && (
                <tr className="bg-gray-900/50">
                    <td colSpan={3} className="p-4">
                        <div className="grid grid-cols-[200px_1fr] gap-y-3 text-sm">
                            <DetailRow label="Container ID" value={container.id} />
                            <DetailRow label="Image" value={container.image} />
                            <DetailRow label="Created" value={container.created} />
                            <DetailRow label="Ports" value={container.ports} />
                            {showLogs && logs && (
                                <div className="col-span-2 mt-4">
                                    <h4 className="text-gray-400 mb-2">Container Logs</h4>
                                    <pre className="bg-gray-800 p-3 rounded-lg overflow-x-auto text-white font-mono text-xs">
                                        {logs}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

interface DetailRowProps {
    label: string;
    value: string;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => (
    <>
        <p className="text-gray-400 pr-4 break-words">{label}</p>
        <p className="text-white font-mono break-words whitespace-pre-wrap">{value}</p>
    </>
);
