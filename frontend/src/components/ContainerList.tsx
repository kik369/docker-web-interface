import React, { useState, useEffect, useMemo } from 'react';
import type { Container } from '../types/docker';
import { useWebSocket } from '../hooks/useWebSocket';
import { useContainers } from '../hooks/useContainers';
import { ContainerRow } from './ContainerRow';
import { HiChevronDown, HiChevronRight, HiPlay, HiStop, HiRefresh, HiCog, HiTrash, HiOutlineCube } from 'react-icons/hi';
import { useTheme } from '../context/ThemeContext';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';

type ContainerListProps = {
    containers: Container[];
    isLoading: boolean;
    error: string | null;
    searchTerm?: string;
    highlightedItem?: { type: string; id: string; timestamp: number } | null;
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
const EXPANDED_ROWS_STORAGE_KEY = 'dockerWebInterface_expandedRows';

export const ContainerList = ({
    containers: initialContainers,
    isLoading,
    error,
    searchTerm = '',
    highlightedItem
}: ContainerListProps) => {
    const { theme } = useTheme();
    const [localContainers, setLocalContainers] = useState<Container[]>(initialContainers);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem(EXPANDED_ROWS_STORAGE_KEY);
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch (err) {
            console.error('Failed to load expanded rows from localStorage:', err);
            return new Set();
        }
    });
    const [actionStates, setActionStates] = useState<Record<string, string | null>>({});
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [containerToDelete, setContainerToDelete] = useState<{ id: string; name: string; type: 'image' | 'container' } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [groupToDelete, setGroupToDelete] = useState<string | null>(null);

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

    // Save expanded rows to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem(EXPANDED_ROWS_STORAGE_KEY, JSON.stringify(Array.from(expandedRows)));
        } catch (err) {
            console.error('Failed to save expanded rows to localStorage:', err);
        }
    }, [expandedRows]);

    // WebSocket setup for real-time updates
    useWebSocket({
        onContainerStateChange: (containerData) => {
            // Log the state change for debugging
            console.log(`Container state change: ${containerData.container_id} -> ${containerData.state}`);

            // Clear action state when we receive an update for this container
            if (actionStates[containerData.container_id]) {
                setActionStates(prev => ({ ...prev, [containerData.container_id]: null }));
            }

            if (containerData.state === 'deleted') {
                // Remove the container from the list
                setLocalContainers(prevContainers =>
                    prevContainers.filter(container => container.id !== containerData.container_id)
                );
            } else {
                // Update the container with the new state
                setLocalContainers(prevContainers => {
                    // Check if the container exists in our list
                    const containerExists = prevContainers.some(
                        container => container.id === containerData.container_id
                    );

                    if (containerExists) {
                        // Update existing container
                        return prevContainers.map(container => {
                            if (container.id === containerData.container_id) {
                                // Determine if this is a transition state
                                const isTransitionState = ['starting', 'stopping', 'restarting'].includes(containerData.state);

                                // For transition states, we want to show them immediately
                                // For final states (running, stopped), we need to ensure we're not overriding a transition
                                const currentIsTransition = ['starting', 'stopping', 'restarting'].includes(container.state);

                                // Only override a transition state if we're getting a final state that doesn't match
                                // the expected outcome of the transition
                                if (currentIsTransition) {
                                    // If we're in a transition state, only update if:
                                    // 1. We're getting another transition state, or
                                    // 2. We're getting a final state that makes sense for the current transition
                                    if (isTransitionState ||
                                        (container.state === 'starting' && containerData.state === 'running') ||
                                        (container.state === 'stopping' && containerData.state === 'stopped') ||
                                        (container.state === 'restarting' && containerData.state === 'running')) {
                                        return {
                                            ...container,
                                            state: containerData.state,
                                            status: containerData.status || container.status,
                                            // Update other fields that might have changed
                                            name: containerData.name || container.name,
                                            image: containerData.image || container.image,
                                            ports: containerData.ports || container.ports,
                                            compose_project: containerData.compose_project || container.compose_project,
                                            compose_service: containerData.compose_service || container.compose_service
                                        };
                                    }
                                    // Otherwise, keep the current transition state
                                    return container;
                                }

                                // Not in a transition state, update normally
                                return {
                                    ...container,
                                    state: containerData.state,
                                    status: containerData.status || container.status,
                                    // Update other fields that might have changed
                                    name: containerData.name || container.name,
                                    image: containerData.image || container.image,
                                    ports: containerData.ports || container.ports,
                                    compose_project: containerData.compose_project || container.compose_project,
                                    compose_service: containerData.compose_service || container.compose_service
                                };
                            }
                            return container;
                        });
                    } else {
                        // This is a new container, add it to the list
                        // Only add if it's not a transition state (starting, stopping, etc.)
                        if (!['deleted', 'removing'].includes(containerData.state)) {
                            return [...prevContainers, {
                                id: containerData.container_id,
                                name: containerData.name,
                                image: containerData.image,
                                status: containerData.status,
                                state: containerData.state,
                                created: containerData.created,
                                ports: containerData.ports,
                                compose_project: containerData.compose_project,
                                compose_service: containerData.compose_service
                            }];
                        }
                        return prevContainers;
                    }
                });
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
            // Special handling for delete action
            if (action === 'delete') {
                const containerToDelete = localContainers.find(c => c.id === containerId);
                if (!containerToDelete) return;

                setContainerToDelete({
                    id: containerId,
                    name: containerToDelete.name,
                    type: 'container'
                });
                setShowDeleteModal(true);
                return;
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
                default:
                    throw new Error(`Unknown action: ${action}`);
            }

            // The WebSocket will handle updating the UI after action completes
        } catch (error) {
            console.error(`Failed to ${action} container:`, error);
            setActionStates(prev => ({ ...prev, [containerId]: null }));
        }
    };

    const handleGroupDelete = (projectName: string) => {
        setGroupToDelete(projectName);
        const groupContainers = localContainers.filter(c => c.compose_project === projectName);
        if (groupContainers.length > 0) {
            setContainerToDelete({
                id: groupContainers.map(c => c.id).join(','),
                name: `${projectName} (${groupContainers.length} containers)`,
                type: 'container'
            });
            setShowDeleteModal(true);
        }
    };

    const handleDeleteConfirm = async (force: boolean) => {
        if (!containerToDelete) return;

        try {
            if (groupToDelete) {
                // Handle group delete
                const groupContainers = localContainers.filter(c => c.compose_project === groupToDelete);
                for (const container of groupContainers) {
                    setActionStates(prev => ({ ...prev, [container.id]: 'delete' }));
                    await deleteContainer(container.id);
                }
                setGroupToDelete(null);
            } else {
                // Handle single container delete
                setActionStates(prev => ({ ...prev, [containerToDelete.id]: 'delete' }));
                await deleteContainer(containerToDelete.id);
            }
            setShowDeleteModal(false);
            setContainerToDelete(null);
            setDeleteError(null);
        } catch (error) {
            console.error('Failed to delete container(s):', error);
            setDeleteError(error instanceof Error ? error.message : 'Failed to delete container(s)');
            if (groupToDelete) {
                const groupContainers = localContainers.filter(c => c.compose_project === groupToDelete);
                groupContainers.forEach(container => {
                    setActionStates(prev => ({ ...prev, [container.id]: null }));
                });
            } else {
                setActionStates(prev => ({ ...prev, [containerToDelete.id]: null }));
            }
        }
    };

    const handleDeleteCancel = () => {
        setShowDeleteModal(false);
        setContainerToDelete(null);
        setDeleteError(null);
    };

    // Group containers by Docker Compose project
    const containerGroups = useMemo<Array<{ projectName: string, containers: Container[] }>>(() => {
        const groups: Record<string, Container[]> = {};

        // First, filter containers based on search term
        const filteredContainers = searchTerm.trim() === ''
            ? localContainers
            : localContainers.filter(container => {
                const searchLower = searchTerm.toLowerCase();
                return (
                    container.name.toLowerCase().includes(searchLower) ||
                    container.image.toLowerCase().includes(searchLower) ||
                    container.id.toLowerCase().includes(searchLower) ||
                    (container.compose_service && container.compose_service.toLowerCase().includes(searchLower)) ||
                    (container.status && container.status.toLowerCase().includes(searchLower))
                );
            });

        filteredContainers.forEach(container => {
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
    }, [localContainers, searchTerm]);

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
        <div className="w-full">
            {localContainers.length === 0 ? (
                <div className={`text-center ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'} mt-4`}>
                    No containers found
                </div>
            ) : (
                <div className="space-y-4">
                    {containerGroups.map(group => (
                        <div
                            key={group.projectName}
                            className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg overflow-hidden border border-opacity-10 ${theme === 'dark' ? 'border-gray-600' : 'border-gray-300'}`}
                            style={{
                                boxShadow: theme === 'dark'
                                    ? '0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 2px 5px 0 rgba(0, 0, 0, 0.2), 0 1px 1px 0 rgba(0, 0, 0, 0.1)'
                                    : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 2px 5px 0 rgba(0, 0, 0, 0.08), 0 1px 1px 0 rgba(0, 0, 0, 0.05)'
                            }}
                        >
                            <div className={`flex items-center justify-between px-4 py-2 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                <div
                                    className="flex items-center cursor-pointer"
                                    onClick={() => toggleGroup(group.projectName)}
                                >
                                    {expandedGroups.has(group.projectName) ? (
                                        <HiChevronDown className={`h-5 w-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mr-2`} />
                                    ) : (
                                        <HiChevronRight className={`h-5 w-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} mr-2`} />
                                    )}
                                    <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'} flex-grow`}>
                                        {group.projectName}
                                        <div className="inline-flex items-center ml-2">
                                            <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                                                <HiOutlineCube className="w-4 h-4 mr-1 text-blue-300" />
                                                <span>{group.containers.length}</span>
                                            </span>
                                        </div>
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
                                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                                            title="Start all containers in this group"
                                        >
                                            <HiPlay className="w-4 h-4 mr-1.5 text-green-400" />
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
                                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                                            title="Stop all containers in this group"
                                        >
                                            <HiStop className="w-4 h-4 mr-1.5 text-red-400" />
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
                                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                                            title="Restart all containers in this group"
                                        >
                                            <HiRefresh className="w-4 h-4 mr-1.5 text-blue-400" />
                                            Restart All
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (window.confirm(`Rebuild all containers in ${group.projectName}?`)) {
                                                    group.containers.forEach(container => {
                                                        handleContainerAction(container.id, 'rebuild');
                                                    });
                                                }
                                            }}
                                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                                            title="Rebuild all containers in this group"
                                        >
                                            <HiCog className="w-4 h-4 mr-1.5 text-purple-400" />
                                            Rebuild All
                                        </button>
                                        <button
                                            onClick={() => handleGroupDelete(group.projectName)}
                                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-md px-3 py-1.5 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                                            title="Delete all containers in this group (WARNING: This action cannot be undone)"
                                        >
                                            <HiTrash className="w-4 h-4 mr-1.5 text-red-400" />
                                            Delete All
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
                                            isHighlighted={highlightedItem?.id === container.id}
                                            highlightTimestamp={highlightedItem?.id === container.id ? highlightedItem.timestamp : undefined}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add DeleteConfirmationDialog */}
            <DeleteConfirmationDialog
                isOpen={showDeleteModal}
                onClose={handleDeleteCancel}
                itemToDelete={containerToDelete}
                onConfirm={handleDeleteConfirm}
                isDeleting={!!containerToDelete && actionStates[containerToDelete.id] === 'delete'}
                error={deleteError}
            />
        </div>
    );
};
