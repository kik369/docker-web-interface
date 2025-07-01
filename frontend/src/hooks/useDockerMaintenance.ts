import { useState, useCallback } from 'react';
import { config } from '../config';
import { logger } from '../services/logging';

interface PruneResult {
    containers_deleted?: string[];
    images_deleted?: any[];
    networks_deleted?: string[];
    volumes_deleted?: string[];
    space_reclaimed: number;
}

export const useDockerMaintenance = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<PruneResult | null>(null);

    const pruneContainers = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            logger.info('Pruning Docker containers...');

            const response = await fetch(`${config.API_URL}/api/docker/prune/containers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok || data.status === 'error') {
                const errorMessage = data.error || 'Failed to prune containers';
                logger.error(`Error pruning containers: ${errorMessage}`);
                setError(errorMessage);
                return false;
            }

            logger.info('Successfully pruned containers:', data.data.result);
            setResult(data.data.result);
            return true;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
            logger.error(`Error pruning containers: ${errorMessage}`);
            setError(errorMessage);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const pruneImages = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            logger.info('Pruning Docker images...');

            const response = await fetch(`${config.API_URL}/api/docker/prune/images`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok || data.status === 'error') {
                const errorMessage = data.error || 'Failed to prune images';
                logger.error(`Error pruning images: ${errorMessage}`);
                setError(errorMessage);
                return false;
            }

            logger.info('Successfully pruned images:', data.data.result);
            setResult(data.data.result);
            return true;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
            logger.error(`Error pruning images: ${errorMessage}`);
            setError(errorMessage);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const pruneVolumes = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            logger.info('Pruning Docker volumes...');

            const response = await fetch(`${config.API_URL}/api/docker/prune/volumes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok || data.status === 'error') {
                const errorMessage = data.error || 'Failed to prune volumes';
                logger.error(`Error pruning volumes: ${errorMessage}`);
                setError(errorMessage);
                return false;
            }

            logger.info('Successfully pruned volumes:', data.data.result);
            setResult(data.data.result);
            return true;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
            logger.error(`Error pruning volumes: ${errorMessage}`);
            setError(errorMessage);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const pruneNetworks = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            logger.info('Pruning Docker networks...');

            const response = await fetch(`${config.API_URL}/api/docker/prune/networks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok || data.status === 'error') {
                const errorMessage = data.error || 'Failed to prune networks';
                logger.error(`Error pruning networks: ${errorMessage}`);
                setError(errorMessage);
                return false;
            }

            logger.info('Successfully pruned networks:', data.data.result);
            setResult(data.data.result);
            return true;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
            logger.error(`Error pruning networks: ${errorMessage}`);
            setError(errorMessage);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const pruneAll = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            logger.info('Pruning all Docker resources...');

            const response = await fetch(`${config.API_URL}/api/docker/prune/all`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok || data.status === 'error') {
                const errorMessage = data.error || 'Failed to prune all Docker resources';
                logger.error(`Error pruning all Docker resources: ${errorMessage}`);
                setError(errorMessage);
                return false;
            }

            logger.info('Successfully pruned all Docker resources:', data.data.result);
            setResult(data.data.result);
            return true;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
            logger.error(`Error pruning all Docker resources: ${errorMessage}`);
            setError(errorMessage);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return {
        isLoading,
        error,
        result,
        pruneContainers,
        pruneImages,
        pruneVolumes,
        pruneNetworks,
        pruneAll,
        formatBytes
    };
};
