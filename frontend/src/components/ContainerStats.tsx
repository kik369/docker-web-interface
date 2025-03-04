import React, { useState, useEffect } from 'react';
import { ContainerStats as ContainerStatsType } from '../types/docker';
import { useContainerStats } from '../hooks/useContainerStats';

// Helper function to format bytes to human-readable format
const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

interface ContainerStatsProps {
    containerId: string;
    isVisible: boolean;
}

export const ContainerStats: React.FC<ContainerStatsProps> = ({ containerId, isVisible }) => {
    const { stats, isLoading, error, isStreaming, startStreaming, stopStreaming } = useContainerStats(
        isVisible ? containerId : null
    );

    // Start streaming when the component becomes visible
    useEffect(() => {
        if (isVisible && !isStreaming) {
            startStreaming();
        } else if (!isVisible && isStreaming) {
            stopStreaming();
        }
    }, [isVisible, isStreaming, startStreaming, stopStreaming]);

    if (!isVisible) return null;

    if (isLoading && !stats) {
        return (
            <div className="bg-gray-900 p-4 rounded-lg mt-2">
                <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-gray-900 p-4 rounded-lg mt-2">
                <div className="text-red-500">Error: {error}</div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="bg-gray-900 p-4 rounded-lg mt-2">
                <div className="text-gray-400">No stats available</div>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 p-4 rounded-lg mt-2">
            <h3 className="text-lg font-semibold text-white mb-4">Container Resources</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* CPU Usage */}
                <div className="bg-gray-800 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-medium text-gray-300">CPU Usage</h4>
                        <span className="text-sm text-white font-bold">{stats.cpu_percent.toFixed(2)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div
                            className="bg-blue-500 h-2.5 rounded-full"
                            style={{ width: `${Math.min(stats.cpu_percent, 100)}%` }}
                        ></div>
                    </div>
                </div>

                {/* Memory Usage */}
                <div className="bg-gray-800 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-medium text-gray-300">Memory Usage</h4>
                        <span className="text-sm text-white font-bold">
                            {formatBytes(stats.memory.usage)} / {formatBytes(stats.memory.limit)} ({stats.memory.percent.toFixed(2)}%)
                        </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div
                            className="bg-green-500 h-2.5 rounded-full"
                            style={{ width: `${Math.min(stats.memory.percent, 100)}%` }}
                        ></div>
                    </div>
                </div>

                {/* Network I/O */}
                <div className="bg-gray-800 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Network I/O</h4>
                    <div className="flex justify-between">
                        <div>
                            <p className="text-xs text-gray-400">Received</p>
                            <p className="text-sm text-white">{formatBytes(stats.network.rx_bytes)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Transmitted</p>
                            <p className="text-sm text-white">{formatBytes(stats.network.tx_bytes)}</p>
                        </div>
                    </div>
                </div>

                {/* Disk I/O */}
                <div className="bg-gray-800 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Disk I/O</h4>
                    <div className="flex justify-between">
                        <div>
                            <p className="text-xs text-gray-400">Read</p>
                            <p className="text-sm text-white">{formatBytes(stats.disk_io.read_bytes)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Written</p>
                            <p className="text-sm text-white">{formatBytes(stats.disk_io.write_bytes)}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 text-xs text-gray-500">
                Last updated: {new Date(stats.timestamp).toLocaleTimeString()}
            </div>
        </div>
    );
};
