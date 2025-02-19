import React, { useState, useCallback } from 'react';
import { Container, ContainerListProps, SortConfig } from '../types/docker';
import { ContainerRow } from './ContainerRow';
import { SearchBar } from './SearchBar';
import { logger } from '../services/logging';

export const ContainerList: React.FC<ContainerListProps> = ({
    containers,
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
        return containers
            .filter(container =>
                Object.values(container).some(value =>
                    value.toLowerCase().includes(searchTerm.toLowerCase())
                )
            )
            .sort((a, b) => {
                if (!sortConfig.key) return 0;
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                const compareResult = aValue.localeCompare(bValue);
                return sortConfig.direction === 'asc' ? compareResult : -compareResult;
            });
    }, [containers, searchTerm, sortConfig]);

    const handleContainerAction = async (containerId: string, action: string) => {
        try {
            logger.info(`Initiating ${action} action for container`, { containerId, action });
            const response = await fetch(`http://localhost:5000/api/containers/${containerId}/${action}`, {
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

    return (
        <div className="relative p-6 rounded-lg overflow-hidden" style={{
            backgroundColor: 'rgba(17, 25, 40, 0.75)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.125)'
        }}>
            {error ? (
                <div className="text-red-500">Error: {error}</div>
            ) : (
                <>
                    <SearchBar value={searchTerm} onChange={setSearchTerm} />
                    {isLoading ? (
                        <div className="text-white">Loading...</div>
                    ) : (
                        <div className="space-y-4">
                            {filteredAndSortedContainers.map(container => (
                                <ContainerRow
                                    key={container.id}
                                    container={container}
                                    isExpanded={expandedRows.has(container.id)}
                                    onToggleExpand={() => toggleRowExpansion(container.id)}
                                    onAction={handleContainerAction}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
