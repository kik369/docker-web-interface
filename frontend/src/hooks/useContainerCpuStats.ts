import { useState, useEffect, useCallback } from 'react';
import { CpuStats } from '../types/docker';
import { config } from '../config';

export const useContainerCpuStats = (containerId: string | null) => {
    const [cpuStats, setCpuStats] = useState<CpuStats | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState<boolean>(false);
    const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);

    const fetchCpuStats = useCallback(async () => {
        if (!containerId) return;

        try {
            setIsLoading(true);
            const response = await fetch(`${config.API_URL}/api/resource-usage-metrics`);
            const data = await response.json();

            if (response.ok && data.status === 'success') {
                const containerStats = data.data.metrics.find((stat: any) => stat.container_id === containerId);
                if (containerStats) {
                    setCpuStats({
                        cpu_percent: containerStats.cpu_percent,
                        timestamp: containerStats.timestamp
                    });
                } else {
                    setError('No CPU stats found for the specified container');
                }
            } else {
                setError(data.error || 'Failed to fetch CPU stats');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsLoading(false);
        }
    }, [containerId]);

    // Start polling for CPU stats
    const startPolling = useCallback(() => {
        if (!containerId) return;

        setIsPolling(true);
        // Initial fetch
        fetchCpuStats();

        // Set up interval for polling
        const id = setInterval(() => {
            fetchCpuStats();
        }, 2000); // Poll every 2 seconds

        setIntervalId(id);
    }, [containerId, fetchCpuStats]);

    // Stop polling
    const stopPolling = useCallback(() => {
        if (intervalId) {
            clearInterval(intervalId);
            setIntervalId(null);
        }
        setIsPolling(false);
    }, [intervalId]);

    // Clean up when component unmounts or containerId changes
    useEffect(() => {
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [intervalId, containerId]);

    return {
        cpuStats,
        isLoading,
        error,
        isPolling,
        startPolling,
        stopPolling
    };
};
