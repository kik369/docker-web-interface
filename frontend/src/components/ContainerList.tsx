import React, { useState, useCallback } from 'react';
import { Container, ContainerListProps, SortConfig } from '../types/docker';
import { ContainerRow } from './ContainerRow';
import { SearchBar } from './SearchBar';

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

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 my-4">
                <p className="text-red-500">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <SearchBar value={searchTerm} onChange={setSearchTerm} />
            </div>

            {isLoading && (
                <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            )}

            <div className="overflow-x-auto rounded-lg">
                <table className="min-w-full bg-gray-800/80 backdrop-blur-sm">
                    <thead>
                        <tr>
                            <th className="p-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                <button
                                    className="hover:text-white focus:outline-none"
                                    onClick={() => handleSort('name')}
                                >
                                    Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th className="p-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                <button
                                    className="hover:text-white focus:outline-none"
                                    onClick={() => handleSort('status')}
                                >
                                    Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th className="p-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {filteredAndSortedContainers.map(container => (
                            <ContainerRow
                                key={container.id}
                                container={container}
                                isExpanded={expandedRows.has(container.id)}
                                onToggleExpand={() => toggleRowExpansion(container.id)}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
