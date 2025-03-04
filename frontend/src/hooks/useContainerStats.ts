import { useState, useEffect, useCallback } from 'react';
import { ContainerStats } from '../types/docker';
import { useWebSocket } from './useWebSocket';
import { logger } from '../services/logging';

export const useContainerStats = (containerId: string | null) => {
    const [stats, setStats] = useState<ContainerStats | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isStreaming, setIsStreaming] = useState<boolean>(false);

    // Use the WebSocket hook to handle stats updates
    const { startStatsStream, isConnected } = useWebSocket({
        onStatsUpdate: (id, statsData) => {
            logger.info(`Received stats update for container ${id}`, {
                containerId: id,
                matchesCurrentContainer: id === containerId,
                statsReceived: !!statsData
            });

            if (id === containerId) {
                setStats(statsData);
                if (isLoading) {
                    setIsLoading(false);
                }
            }
        },
        onError: (errorMsg) => {
            setError(errorMsg);
            setIsStreaming(false);
            setIsLoading(false);
            logger.error(`Error in container stats stream: ${errorMsg}`);
        },
        enabled: true // Always enable the WebSocket connection
    });

    // Start streaming stats
    const startStreaming = useCallback(() => {
        if (containerId) {
            logger.info(`Starting stats stream for container ${containerId}`, {
                isConnected,
                isStreaming
            });
            setIsLoading(true);
            setError(null);
            setIsStreaming(true);
            startStatsStream(containerId);
        }
    }, [containerId, startStatsStream, isConnected]);

    // Stop streaming stats
    const stopStreaming = useCallback(() => {
        logger.info(`Stopping stats stream for container ${containerId}`);
        setIsStreaming(false);
    }, [containerId]);

    // Clean up on unmount or when containerId changes
    useEffect(() => {
        return () => {
            stopStreaming();
        };
    }, [containerId, stopStreaming]);

    return {
        stats,
        isLoading,
        error,
        isStreaming,
        startStreaming,
        stopStreaming
    };
};
