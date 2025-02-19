import React, { useState, useCallback } from 'react';
import { Container, ContainerListProps, SortConfig } from '../types/docker';
import { ContainerRow } from './ContainerRow';
import { SearchBar } from './SearchBar';
import { logger } from '../services/logging';
import { config } from '../config';

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
    const [sortConfig, setSortConfig] = useState<SortConfig>({
        key: null,
        direction: 'asc',
    });

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

    const handleSort = useCallback((key: keyof Container) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
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

        if (sortConfig.key) {
            filtered.sort((a, b) => {
                const aValue = a[sortConfig.key!];
                const bValue = b[sortConfig.key!];
                const compareResult = String(aValue).localeCompare(String(bValue));
                return sortConfig.direction === 'asc' ? compareResult : -compareResult;
            });
        }

        // Group containers by compose project
        const grouped: GroupedContainers = filtered.reduce((acc, container) => {
            const projectKey = container.compose_project || 'Standalone Containers';
            if (!acc[projectKey]) {
                acc[projectKey] = [];
            }
            acc[projectKey].push(container);
            return acc;
        }, {} as GroupedContainers);

        return grouped;
    }, [containers, searchTerm, sortConfig]);

    const handleContainerAction = async (containerId: string, action: string) => {
        try {
            logger.info(`Initiating ${action} action for container`, { containerId, action });
            const response = await fetch(`${config.API_URL}/api/containers/${containerId}/${action}`, {
                method: 'POST',
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Failed to ${action} container`);
            }

            logger.info(`Successfully completed ${action} action for container`, { containerId, action });
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
            <SearchBar value={searchTerm} onChange={setSearchTerm} />
            <div className="sort-header">
                <button onClick={() => handleSort('name')} className="sort-button">
                    Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </button>
                <button onClick={() => handleSort('status')} className="sort-button">
                    Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </button>
                <button onClick={() => handleSort('state')} className="sort-button">
                    State {sortConfig.key === 'state' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </button>
            </div>
            {Object.entries(filteredAndSortedContainers).map(([projectName, projectContainers]) => (
                <div key={projectName} className="compose-project-group">
                    <h3 className="compose-project-title">
                        {projectName} ({projectContainers.length} containers)
                    </h3>
                    <div className="container-group">
                        {projectContainers.map(container => (
                            <ContainerRow
                                key={container.id}
                                container={container}
                                isExpanded={expandedRows.has(container.id)}
                                onToggleExpand={() => toggleRowExpansion(container.id)}
                                onAction={handleContainerAction}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};
