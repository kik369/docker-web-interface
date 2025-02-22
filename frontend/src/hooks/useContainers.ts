import { useState, useEffect, useCallback } from 'react';
import { Container, ApiResponse } from '../types/docker';
import { config } from '../config';

export const useContainers = () => {
    const [containers, setContainers] = useState<Container[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionStates, setActionStates] = useState<Record<string, string | null>>({});
    const [pollingIntervals, setPollingIntervals] = useState<{ [key: string]: NodeJS.Timeout }>({});

    const fetchContainers = useCallback(async () => {
        try {
            console.log('Fetching containers...');
            setIsLoading(true);
            const response = await fetch(`${config.API_URL}/api/containers`);
            const result: ApiResponse<Container[]> = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to fetch containers');
            }

            if (result.status === 'error') {
                throw new Error(result.error || 'Failed to fetch containers');
            }

            console.log('Containers fetched successfully:', result.data.length);
            setContainers(result.data);
            setError(null);
        } catch (err) {
            console.error('Error fetching containers:', err);
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
                        const hasReachedTargetState = (
                            (action === 'stop' && (updatedContainer.state === 'stopped' || updatedContainer.state === 'exited')) ||
                            (action === 'start' && updatedContainer.state === 'running') ||
                            (action === 'restart' && updatedContainer.state === 'running') ||
                            (action === 'rebuild' && updatedContainer.state === 'running')
                        );

                        if (hasReachedTargetState) {
                            // Clear the interval and action state
                            clearInterval(pollingIntervals[containerId]);
                            delete pollingIntervals[containerId];
                            setActionStates(prev => ({ ...prev, [containerId]: null }));

                            // Trigger a full page refresh
                            window.location.reload();
                        }
                    }
                }
            } catch (err) {
                console.error('Error polling container state:', err);
            }

            if (attempts >= maxAttempts) {
                clearInterval(pollingIntervals[containerId]);
                delete pollingIntervals[containerId];
                setActionStates(prev => ({ ...prev, [containerId]: null }));
                // Trigger a full page refresh even if we hit max attempts
                window.location.reload();
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
    }, [pollingIntervals]);

    const performContainerAction = useCallback(async (containerId: string, action: string) => {
        try {
            // Set action state before making the request
            setActionStates(prev => ({ ...prev, [containerId]: action }));

            const response = await fetch(`${config.API_URL}/api/containers/${containerId}/${action}`, {
                method: 'POST',
            });
            const result: ApiResponse<{ message: string }> = await response.json();

            if (!response.ok) {
                // Clear action state on error
                setActionStates(prev => ({ ...prev, [containerId]: null }));
                throw new Error(result.error || `Failed to ${action} container`);
            }

            // Immediately fetch the latest state
            const updatedResponse = await fetch(`${config.API_URL}/api/containers`);
            const updatedResult: ApiResponse<Container[]> = await updatedResponse.json();

            if (updatedResult.status === 'success') {
                setContainers(updatedResult.data);
            }

            // Start polling for state changes
            pollContainerState(containerId, action);

            return result.data.message;
        } catch (err) {
            // Clear action state on error
            setActionStates(prev => ({ ...prev, [containerId]: null }));
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

    const deleteContainer = useCallback((containerId: string) =>
        performContainerAction(containerId, 'delete'), [performContainerAction]);

    useEffect(() => {
        fetchContainers();
        // Clean up any active polling intervals
        return () => {
            Object.values(pollingIntervals).forEach(clearInterval);
        };
    }, [fetchContainers, pollingIntervals]);

    return {
        containers,
        isLoading,
        error,
        actionStates,
        refresh: fetchContainers,
        fetchContainerLogs,
        startContainer,
        stopContainer,
        restartContainer,
        rebuildContainer,
        deleteContainer,
    };
};
