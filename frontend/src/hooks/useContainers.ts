import { useState, useEffect, useCallback } from 'react';
import { Container, ApiResponse } from '../types/docker';
import { config } from '../config';

export const useContainers = () => {
    const [containers, setContainers] = useState<Container[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    const performContainerAction = useCallback(async (containerId: string, action: string) => {
        try {
            const response = await fetch(`${config.API_URL}/api/containers/${containerId}/${action}`, {
                method: 'POST',
            });
            const result: ApiResponse<{ message: string }> = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Failed to ${action} container`);
            }

            // Refresh container list after action
            await fetchContainers();
            return result.data.message;
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : `Failed to ${action} container`);
        }
    }, [fetchContainers]);

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
        return () => clearInterval(interval);
    }, [fetchContainers]);

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
