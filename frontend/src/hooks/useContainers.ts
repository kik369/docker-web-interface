import { useState, useEffect, useCallback } from 'react';
import { Container, ApiResponse } from '../types/docker';
import { config } from '../config';

export const useContainers = () => {
    const [containers, setContainers] = useState<Container[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionStates, setActionStates] = useState<Record<string, string | null>>({});

    const fetchContainers = useCallback(async () => {
        try {
            setIsLoading(true);
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

    const performContainerAction = useCallback(async (containerId: string, action: string) => {
        try {
            // Set action state before making the request
            setActionStates(prev => ({ ...prev, [containerId]: action }));

            const response = await fetch(`${config.API_URL}/api/containers/${containerId}/${action}`, {
                method: 'POST',
            });
            const result: ApiResponse<{ message: string }> = await response.json();

            if (!response.ok) {
                setActionStates(prev => ({ ...prev, [containerId]: null }));
                throw new Error(result.error || `Failed to ${action} container`);
            }

            // The WebSocket will handle state updates, so we don't need to poll
            // Just clear the action state after a reasonable timeout in case
            // the WebSocket doesn't receive the event for some reason
            setTimeout(() => {
                setActionStates(prev => ({ ...prev, [containerId]: null }));
            }, 10000); // 10 second timeout as a fallback

            return result.data.message;
        } catch (err) {
            setActionStates(prev => ({ ...prev, [containerId]: null }));
            throw new Error(err instanceof Error ? err.message : `Failed to ${action} container`);
        }
    }, []);

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

    // Initial fetch only
    useEffect(() => {
        fetchContainers();
    }, [fetchContainers]);

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
