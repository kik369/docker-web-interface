import React, { useState, useEffect } from 'react';
import type { Container } from '../types/docker';
import { useWebSocket } from '../hooks/useWebSocket';
import { useContainers } from '../hooks/useContainers';
import { ContainerRow } from './ContainerRow';

type ContainerListProps = {
    containers: Container[];
    isLoading: boolean;
    error: string | null;
};

const LoadingSpinner = () => (
    <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
    </div>
);

const ErrorMessage = ({ message }: { message: string }) => (
    <div className="text-red-500 p-4 text-center">
        Error: {message}
    </div>
);

export const ContainerList = ({
    containers: initialContainers,
    isLoading,
    error
}: ContainerListProps) => {
    const [localContainers, setLocalContainers] = useState<Container[]>(initialContainers);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [actionStates, setActionStates] = useState<Record<string, string | null>>({});

    // Update local containers when prop changes
    useEffect(() => {
        setLocalContainers(initialContainers);
    }, [initialContainers]);

    // WebSocket setup for real-time updates
    useWebSocket({
        onContainerStateChange: (containerData) => {
            // Clear action state when we receive an update for this container
            if (actionStates[containerData.container_id]) {
                setActionStates(prev => ({ ...prev, [containerData.container_id]: null }));
            }
            
            if (containerData.state === 'deleted') {
                setLocalContainers(prevContainers =>
                    prevContainers.filter(container => container.id !== containerData.container_id)
                );
            } else {
                setLocalContainers(prevContainers =>
                    prevContainers.map(container =>
                        container.id === containerData.container_id
                            ? {
                                ...container,
                                state: containerData.state,
                                status: containerData.status || container.status
                            }
                            : container
                    )
                );
            }
        },
        onError: (error) => {
            console.error('WebSocket error:', error);
        }
    });

    const handleToggleExpand = (containerId: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (newSet.has(containerId)) {
                newSet.delete(containerId);
            } else {
                newSet.add(containerId);
            }
            return newSet;
        });
    };

    const { 
        startContainer, 
        stopContainer, 
        restartContainer, 
        rebuildContainer, 
        deleteContainer 
    } = useContainers();

    const handleContainerAction = async (containerId: string, action: string) => {
        try {
            // Ask for confirmation before deleting a container
            if (action === 'delete') {
                const containerName = localContainers.find(c => c.id === containerId)?.name || 'unknown';
                if (!window.confirm(`Are you sure you want to delete container "${containerName}"?`)) {
                    return;
                }
            }
            
            setActionStates(prev => ({ ...prev, [containerId]: action }));
            
            // Call the appropriate container action method
            switch (action) {
                case 'start':
                    await startContainer(containerId);
                    break;
                case 'stop':
                    await stopContainer(containerId);
                    break;
                case 'restart':
                    await restartContainer(containerId);
                    break;
                case 'rebuild':
                    await rebuildContainer(containerId);
                    break;
                case 'delete':
                    await deleteContainer(containerId);
                    break;
                default:
                    throw new Error(`Unknown action: ${action}`);
            }
            
            // The WebSocket will handle updating the UI after action completes
            
        } catch (error) {
            console.error(`Failed to ${action} container:`, error);
            setActionStates(prev => ({ ...prev, [containerId]: null }));
        } finally {
            // Clear action state after a short delay to allow animation to be visible
            // if we haven't already cleared it due to an error
            if (action !== 'delete') { // Don't auto-clear for delete as it may take longer
                setTimeout(() => {
                    setActionStates(prev => ({ ...prev, [containerId]: null }));
                }, 1000);
            }
        }
    };

    if (isLoading) {
        return <LoadingSpinner />;
    }

    if (error) {
        return <ErrorMessage message={error} />;
    }

    return (
        <div className="container-list">
            {localContainers.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                    No containers found
                </div>
            ) : (
                <div className="grid gap-4">
                    {localContainers.map(container => (
                        <ContainerRow
                            key={container.id}
                            container={container}
                            isExpanded={expandedRows.has(container.id)}
                            onToggleExpand={() => handleToggleExpand(container.id)}
                            onAction={handleContainerAction}
                            actionInProgress={actionStates[container.id] || null}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
