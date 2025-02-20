import { useState, useEffect, useCallback } from 'react';
import { Container, ApiResponse } from '../types/docker';
import { config } from '../config';

export const useContainers = () => {
    const [containers, setContainers] = useState<Container[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pollingIntervals, setPollingIntervals] = useState<{ [key: string]: NodeJS.Timeout }>({});

    const fetchContainers = useCallback(async () => {
        try {
            const response = await fetch(`${config.API_URL}/api/containers`);
            const result: ApiResponse<Container[]> = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to fetch containers');
            }

            if (result.status === 'error') {
                throw new Error(result.error || 'Failed to fetch containers');
            }

            setContainers(result.data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchContainerLogs = useCallback(async (containerId: string) => {
        try {
            const response = await fetch(`${config.API_URL}/api/containers/${containerId}/logs`);
            const result: ApiResponse<{ logs: string }> = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to fetch container logs');
            }

            return result.data.logs;
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : 'Failed to fetch container logs');
        }
    }, []);

    // Function to poll container state until it changes
    const pollContainerState = useCallback(async (containerId: string, action: string) => {
        const maxAttempts = 15; // 15 seconds max
        let attempts = 0;

        // Clear any existing polling for this container
        if (pollingIntervals[containerId]) {
            clearInterval(pollingIntervals[containerId]);
        }

        const interval = setInterval(async () => {
            attempts++;

            try {
                const response = await fetch(`${config.API_URL}/api/containers`);
                const result: ApiResponse<Container[]> = await response.json();

                if (result.status === 'success') {
                    const updatedContainer = result.data.find(c => c.id === containerId);

                    if (updatedContainer) {
                        const shouldStopPolling = (
                            (action === 'stop' && updatedContainer.state !== 'running') ||
                            (action === 'start' && updatedContainer.state === 'running') ||
                            (action === 'restart' && updatedContainer.state === 'running') ||
                            (action === 'rebuild' && updatedContainer.state === 'running')
                        );

                        if (shouldStopPolling) {
                            clearInterval(pollingIntervals[containerId]);
                            delete pollingIntervals[containerId];
                            setContainers(result.data);
                        }
                    }
                }
            } catch (err) {
                console.error('Error polling container state:', err);
            }

            if (attempts >= maxAttempts) {
                clearInterval(pollingIntervals[containerId]);
                delete pollingIntervals[containerId];
                // Do a final refresh
                await fetchContainers();
            }
        }, 1000);

        setPollingIntervals(prev => ({
            ...prev,
            [containerId]: interval
        }));

        // Clean up interval on component unmount
        return () => {
            clearInterval(interval);
        };
    }, [pollingIntervals, fetchContainers]);

    const performContainerAction = useCallback(async (containerId: string, action: string) => {
        try {
            const response = await fetch(`${config.API_URL}/api/containers/${containerId}/${action}`, {
                method: 'POST',
            });
            const result: ApiResponse<{ message: string }> = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Failed to ${action} container`);
            }

            // Start polling for state changes
            pollContainerState(containerId, action);

            return result.data.message;
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : `Failed to ${action} container`);
        }
    }, [pollContainerState]);

    const startContainer = useCallback((containerId: string) =>
        performContainerAction(containerId, 'start'), [performContainerAction]);

    const stopContainer = useCallback((containerId: string) =>
        performContainerAction(containerId, 'stop'), [performContainerAction]);

    const restartContainer = useCallback((containerId: string) =>
        performContainerAction(containerId, 'restart'), [performContainerAction]);

    const rebuildContainer = useCallback((containerId: string) =>
        performContainerAction(containerId, 'rebuild'), [performContainerAction]);

    useEffect(() => {
        fetchContainers();
        const interval = setInterval(fetchContainers, config.REFRESH_INTERVAL);
        return () => {
            clearInterval(interval);
            // Clean up any active polling intervals
            Object.values(pollingIntervals).forEach(clearInterval);
        };
    }, [fetchContainers, pollingIntervals]);

    return {
        containers,
        isLoading,
        error,
        refresh: fetchContainers,
        fetchContainerLogs,
        startContainer,
        stopContainer,
        restartContainer,
        rebuildContainer,
    };
};
