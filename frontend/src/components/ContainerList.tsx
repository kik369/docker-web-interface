import React, { useState, useEffect, useMemo } from 'react';
import type { Container } from '../types/docker';
import { useWebSocket } from '../hooks/useWebSocket';
import { useContainers } from '../hooks/useContainers';
import { ContainerRow } from './ContainerRow';
import { HiChevronDown, HiChevronRight } from 'react-icons/hi';

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

// Key for persisting expanded state in local storage
const COMPOSE_GROUPS_STORAGE_KEY = 'dockerWebInterface_expandedComposeGroups';

export const ContainerList = ({
    containers: initialContainers,
    isLoading,
    error
}: ContainerListProps) => {
    const [localContainers, setLocalContainers] = useState<Container[]>(initialContainers);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [actionStates, setActionStates] = useState<Record<string, string | null>>({});

    // Store which Docker Compose groups are expanded
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem(COMPOSE_GROUPS_STORAGE_KEY);
            return saved ? new Set(JSON.parse(saved)) : new Set(['Standalone Containers']);
        } catch (err) {
            console.error('Failed to load expanded groups from localStorage:', err);
            return new Set(['Standalone Containers']);
        }
    });

    // Update local containers when prop changes
    useEffect(() => {
        setLocalContainers(initialContainers);
    }, [initialContainers]);

    // Save expanded groups to localStorage whenever they change
    useEffect(() => {
        try {
            // Convert Set to Array using Array.from() instead of spread operator
            localStorage.setItem(COMPOSE_GROUPS_STORAGE_KEY, JSON.stringify(Array.from(expandedGroups)));
        } catch (err) {
            console.error('Failed to save expanded groups to localStorage:', err);
        }
    }, [expandedGroups]);

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

    // Group containers by Docker Compose project
    const containerGroups = useMemo<Array<{ projectName: string, containers: Container[] }>>(() => {
        const groups: Record<string, Container[]> = {};

        localContainers.forEach(container => {
            // Use the compose_project property, defaulting to 'Standalone Containers' if not present
            const projectName = container.compose_project || 'Standalone Containers';

            if (!groups[projectName]) {
                groups[projectName] = [];
            }

            groups[projectName].push(container);
        });

        // Sort the groups by name, but keep 'Standalone Containers' at the top
        return Object.entries(groups)
            .sort(([a], [b]) => {
                if (a === 'Standalone Containers') return -1;
                if (b === 'Standalone Containers') return 1;
                return a.localeCompare(b);
            })
            .map(([projectName, containers]) => ({
                projectName,
                containers: containers.sort((a, b) => a.name.localeCompare(b.name))
            }));
    }, [localContainers]);

    const toggleGroup = (projectName: string) => {
        setExpandedGroups(prev => {
            const newGroups = new Set(prev);
            if (newGroups.has(projectName)) {
                newGroups.delete(projectName);
            } else {
                newGroups.add(projectName);
            }
            return newGroups;
        });
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
                <div className="space-y-6">
                    {containerGroups.map(group => (
                        <div key={group.projectName} className="bg-gray-900 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 bg-gray-800">
                                <div
                                    className="flex items-center cursor-pointer"
                                    onClick={() => toggleGroup(group.projectName)}
                                >
                                    {expandedGroups.has(group.projectName) ? (
                                        <HiChevronDown className="h-5 w-5 text-gray-400 mr-2" />
                                    ) : (
                                        <HiChevronRight className="h-5 w-5 text-gray-400 mr-2" />
                                    )}
                                    <h2 className="text-xl font-semibold text-white flex-grow">
                                        {group.projectName}
                                        <span className="ml-2 text-sm text-gray-400 font-normal">
                                            ({group.containers.length} container{group.containers.length !== 1 ? 's' : ''})
                                        </span>
                                    </h2>
                                </div>

                                {/* Only show group actions for Docker Compose projects */}
                                {group.projectName !== 'Standalone Containers' && (
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => {
                                                if (window.confirm(`Start all containers in ${group.projectName}?`)) {
                                                    group.containers.forEach(container => {
                                                        if (container.state !== 'running') {
                                                            handleContainerAction(container.id, 'start');
                                                        }
                                                    });
                                                }
                                            }}
                                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                            title="Start all containers in this group"
                                        >
                                            Start All
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (window.confirm(`Stop all containers in ${group.projectName}?`)) {
                                                    group.containers.forEach(container => {
                                                        if (container.state === 'running') {
                                                            handleContainerAction(container.id, 'stop');
                                                        }
                                                    });
                                                }
                                            }}
                                            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                                            title="Stop all containers in this group"
                                        >
                                            Stop All
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (window.confirm(`Restart all containers in ${group.projectName}?`)) {
                                                    group.containers.forEach(container => {
                                                        handleContainerAction(container.id, 'restart');
                                                    });
                                                }
                                            }}
                                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                                            title="Restart all containers in this group"
                                        >
                                            Restart All
                                        </button>
                                    </div>
                                )}
                            </div>

                            {expandedGroups.has(group.projectName) && (
                                <div className="grid gap-4 p-4">
                                    {group.containers.map(container => (
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
                    ))}
                </div>
            )}
        </div>
    );
};
