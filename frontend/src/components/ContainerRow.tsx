import React, { useState } from 'react';
import { HiInformationCircle, HiDocument } from 'react-icons/hi';
import { ContainerRowProps } from '../types/docker';
import { useContainers } from '../hooks/useContainers';

export const ContainerRow: React.FC<ContainerRowProps> = ({
    container,
    isExpanded,
    onToggleExpand,
}) => {
    const [logs, setLogs] = useState<string>('');
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const { fetchContainerLogs } = useContainers();

    const handleViewLogs = async () => {
        try {
            setIsLoadingLogs(true);
            const containerLogs = await fetchContainerLogs(container.id);
            setLogs(containerLogs);
        } catch (error) {
            console.error('Failed to fetch logs:', error);
            setLogs('Failed to fetch container logs');
        } finally {
            setIsLoadingLogs(false);
        }
    };

    return (
        <>
            <tr className="hover:bg-gray-700/50">
                <td className="p-3 text-sm text-white">{container.name}</td>
                <td className="p-3 text-sm">
                    <span
                        className={`px-2 py-1 rounded-full text-xs ${
                            container.status.toLowerCase().includes('up')
                                ? 'bg-green-500/20 text-green-300'
                                : 'bg-yellow-500/20 text-yellow-300'
                        }`}
                    >
                        {container.status}
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
                        <span>{isLoadingLogs ? 'Loading...' : 'View Logs'}</span>
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
                            {logs && (
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
