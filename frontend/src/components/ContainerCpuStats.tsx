import React, { useEffect } from 'react';
import { useContainerCpuStats } from '../hooks/useContainerCpuStats';

interface ContainerCpuStatsProps {
    containerId: string;
    isVisible: boolean;
}

export const ContainerCpuStats: React.FC<ContainerCpuStatsProps> = ({
    containerId,
    isVisible
}) => {
    const {
        cpuStats,
        isLoading,
        error,
        isPolling,
        startPolling,
        stopPolling
    } = useContainerCpuStats(isVisible ? containerId : null);

    // Start or stop polling based on visibility
    useEffect(() => {
        if (isVisible && !isPolling) {
            startPolling();
        } else if (!isVisible && isPolling) {
            stopPolling();
        }

        return () => {
            if (isPolling) {
                stopPolling();
            }
        };
    }, [isVisible, isPolling, startPolling, stopPolling]);

    if (!isVisible) return null;

    if (error) {
        return (
            <div className="bg-gray-900 p-4 rounded-lg mt-2">
                <div className="text-red-500">Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 p-4 rounded-lg mt-2">
            <h3 className="text-lg font-semibold text-white mb-4">CPU Usage</h3>

            <div className="bg-gray-800 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-medium text-gray-300">CPU</h4>
                    {isLoading && !cpuStats ? (
                        <span className="text-sm text-gray-400">Loading...</span>
                    ) : (
                        <span className="text-sm text-white font-bold">
                            {cpuStats?.cpu_percent.toFixed(2)}%
                        </span>
                    )}
                </div>

                <div className="w-full bg-gray-700 rounded-full h-2.5">
                    <div
                        className="bg-blue-500 h-2.5 rounded-full transition-all duration-500 ease-in-out"
                        style={{
                            width: `${cpuStats ? Math.min(cpuStats.cpu_percent, 100) : 0}%`
                        }}
                    ></div>
                </div>

                {cpuStats && (
                    <div className="mt-2 text-xs text-gray-500">
                        Last updated: {new Date(cpuStats.timestamp).toLocaleTimeString()}
                    </div>
                )}
            </div>
        </div>
    );
};
