import React, { useState, useCallback, useEffect } from 'react';
import { Container, ContainerListProps } from '../types/docker';
import { ContainerRow } from './ContainerRow';
import { SearchBar } from './SearchBar';
import { logger } from '../services/logging';
import { useContainers } from '../hooks/useContainers';
import { HiChevronDown, HiChevronRight } from 'react-icons/hi';
import { FaServer } from 'react-icons/fa';
import { BiCube } from 'react-icons/bi';
import { IconBaseProps } from 'react-icons';

// Create wrapper components for icons
const ServerIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <FaServer {...props} />
);

const CubeIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <BiCube {...props} />
);

const ChevronDownIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiChevronDown {...props} />
);

const ChevronRightIcon: React.FC<IconBaseProps> = (props): React.JSX.Element => (
    <HiChevronRight {...props} />
);

interface GroupedContainers {
    [key: string]: Container[];
}

const STORAGE_KEY = 'dockerWebInterface_expandedGroups';

export const ContainerList: React.FC<ContainerListProps> = ({
    containers = [],
    isLoading,
    error,
}) => {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch (err) {
            logger.error('Failed to load expanded groups from localStorage:', err instanceof Error ? err : new Error(String(err)));
            return new Set();
        }
    });
    const [searchTerm, setSearchTerm] = useState('');
    const { actionStates, startContainer, stopContainer, restartContainer, rebuildContainer } = useContainers();

    // Save expanded groups to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(expandedGroups)));
        } catch (err) {
            logger.error('Failed to save expanded groups to localStorage:', err instanceof Error ? err : new Error(String(err)));
        }
    }, [expandedGroups]);

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

    const toggleGroupExpansion = useCallback((groupName: string) => {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (prev.has(groupName)) {
                newSet.delete(groupName);
            } else {
                newSet.add(groupName);
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
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold text-white mb-2 sm:mb-0">Docker Compose Applications</h2>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center px-2 py-1 bg-blue-500 text-white text-sm rounded-full">
                            <ServerIcon className="w-4 h-4 mr-1" />
                            <span>{Object.keys(filteredAndSortedContainers).filter(key => key !== 'Standalone Containers').length}</span>
                        </div>
                        <div className="flex items-center px-2 py-1 bg-blue-500 text-white text-sm rounded-full">
                            <CubeIcon className="w-4 h-4 mr-1" />
                            <span>
                                {Object.entries(filteredAndSortedContainers)
                                    .filter(([key]) => key !== 'Standalone Containers')
                                    .reduce((acc, [_, containers]) => acc + containers.length, 0)}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="mb-2 sm:mb-0 sm:ml-4">
                    <SearchBar value={searchTerm} onChange={setSearchTerm} />
                </div>
            </div>
            {Object.entries(filteredAndSortedContainers).map(([projectName, projectContainers]) => (
                projectName !== 'Standalone Containers' ? (
                    <div key={projectName} className="compose-project-group mb-6">
                        <div
                            className="compose-project-header flex items-center justify-between mb-4 cursor-pointer hover:bg-gray-700 p-2 rounded-lg transition-colors duration-200"
                            onClick={() => toggleGroupExpansion(projectName)}
                        >
                            <h3 className="compose-project-title flex items-center">
                                {expandedGroups.has(projectName) ? (
                                    <ChevronDownIcon className="w-5 h-5 mr-2 text-gray-400" />
                                ) : (
                                    <ChevronRightIcon className="w-5 h-5 mr-2 text-gray-400" />
                                )}
                                {projectName}
                                <div className="flex items-center ml-3 px-2 py-1 bg-blue-500 text-white text-sm rounded-full">
                                    <CubeIcon className="w-4 h-4 mr-1" />
                                    <span>{projectContainers.length}</span>
                                </div>
                            </h3>
                        </div>
                        {expandedGroups.has(projectName) && (
                            <div className="container-group pl-4">
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
                        )}
                    </div>
                ) : null
            ))}

            {/* Standalone Containers Section */}
            {filteredAndSortedContainers['Standalone Containers'] && (
                <div className="mt-8">
                    <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-xl font-semibold text-white">Standalone Containers</h2>
                        <div className="flex items-center px-2 py-1 bg-blue-500 text-white text-sm rounded-full">
                            <CubeIcon className="w-4 h-4 mr-1" />
                            <span>{filteredAndSortedContainers['Standalone Containers'].length}</span>
                        </div>
                    </div>
                    <div className="container-group">
                        {filteredAndSortedContainers['Standalone Containers'].map(container => (
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
            )}
        </div>
    );
};
