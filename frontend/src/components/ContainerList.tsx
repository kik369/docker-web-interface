import React, { useState, useCallback } from 'react';
import { Container, ContainerListProps } from '../types/docker';
import { ContainerRow } from './ContainerRow';
import { SearchBar } from './SearchBar';
import { logger } from '../services/logging';
import { config } from '../config';
import { useContainers } from '../hooks/useContainers';

interface GroupedContainers {
    [key: string]: Container[];
}

export const ContainerList: React.FC<ContainerListProps> = ({
    containers = [],
    isLoading,
    error,
}) => {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const { actionStates, startContainer, stopContainer, restartContainer, rebuildContainer } = useContainers();

    const toggleRowExpansion = useCallback((containerId: string) => {
        setExpandedRows(prev => {
            const newSet = new Set(prev);
            if (prev.has(containerId)) {
                newSet.delete(containerId);
            } else {
                newSet.add(containerId);
            }
            return newSet;
        });
    }, []);

    const filteredAndSortedContainers = React.useMemo(() => {
        if (!Array.isArray(containers)) {
            return {};
        }

        const filtered = containers.filter(container =>
            Object.values(container).some(value =>
                String(value).toLowerCase().includes(searchTerm.toLowerCase())
            )
        );

        // First sort containers by their service name within each project
        filtered.sort((a, b) => {
            const aService = a.compose_service || a.name;
            const bService = b.compose_service || b.name;
            return aService.localeCompare(bService);
        });

        // Then group containers by compose project
        const grouped: GroupedContainers = filtered.reduce((acc, container) => {
            // Ensure we use the actual compose project name if available
            const projectKey = container.compose_project || 'Standalone Containers';

            if (!acc[projectKey]) {
                acc[projectKey] = [];
            }
            acc[projectKey].push(container);
            return acc;
        }, {} as GroupedContainers);

        // Move Standalone Containers to the end and sort other projects alphabetically
        const orderedGroups: GroupedContainers = {};
        Object.keys(grouped)
            .sort((a, b) => {
                if (a === 'Standalone Containers') return 1;
                if (b === 'Standalone Containers') return -1;
                return a.localeCompare(b);
            })
            .forEach(key => {
                orderedGroups[key] = grouped[key];
            });

        return orderedGroups;
    }, [containers, searchTerm]);

    const handleContainerAction = async (containerId: string, action: string) => {
        try {
            logger.info(`Initiating ${action} action for container`, { containerId, action });

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

            logger.info(`Successfully initiated ${action} action for container`, { containerId, action });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : `Failed to ${action} container`;
            logger.error(`Error during ${action} action for container`, err instanceof Error ? err : undefined, {
                containerId,
                action
            });
            throw new Error(errorMessage);
        }
    };

    if (isLoading) {
        return <div className="loading">Loading containers...</div>;
    }

    if (error) {
        return <div className="error">Error: {error}</div>;
    }

    return (
        <div className="container-list">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white mb-2 sm:mb-0">Container Groups</h2>
                <div className="mb-2 sm:mb-0 sm:ml-4">
                    <SearchBar value={searchTerm} onChange={setSearchTerm} />
                </div>
            </div>
            {Object.entries(filteredAndSortedContainers).map(([projectName, projectContainers]) => (
                <div key={projectName} className="compose-project-group mb-6">
                    <div className="compose-project-header flex items-center justify-between mb-4">
                        <h3 className="compose-project-title flex items-center">
                            <span className="text-xl font-semibold">{projectName}</span>
                            <span className="ml-3 px-2 py-1 bg-blue-500 text-white text-sm rounded-full">
                                {projectContainers.length} {projectContainers.length === 1 ? 'container' : 'containers'}
                            </span>
                        </h3>
                    </div>
                    <div className="container-group grid gap-4">
                        {projectContainers.map(container => (
                            <ContainerRow
                                key={container.id}
                                container={container}
                                isExpanded={expandedRows.has(container.id)}
                                onToggleExpand={() => toggleRowExpansion(container.id)}
                                onAction={handleContainerAction}
                                actionInProgress={actionStates[container.id] || null}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};
