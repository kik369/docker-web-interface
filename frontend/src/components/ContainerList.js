import React, { useState } from 'react';

const ContainerList = ({ containerData }) => {
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({
        key: null,
        direction: 'asc',
    });

    // Parse the table data
    const parseContainerData = data => {
        if (!data) return [];

        const lines = data.trim().split('\n');
        if (lines.length < 2) return [];

        // Extract headers
        const headers = lines[0].split(/\s{2,}/);

        // Parse container rows
        return lines.slice(1).map(line => {
            const row = {};
            let remainingLine = line.trim();

            headers.forEach(header => {
                // Find the next double space gap or end of line
                const match = remainingLine.match(/^(.+?)(?:\s{2,}|$)/);
                if (match) {
                    row[header.toLowerCase()] = match[1].trim();
                    remainingLine = remainingLine.slice(match[0].length);
                }
            });

            return row;
        });
    };

    const containers = parseContainerData(containerData);

    // Handle row expansion
    const toggleRowExpansion = index => {
        const newExpandedRows = new Set(expandedRows);
        if (expandedRows.has(index)) {
            newExpandedRows.delete(index);
        } else {
            newExpandedRows.add(index);
        }
        setExpandedRows(newExpandedRows);
    };

    // Handle sorting
    const handleSort = key => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Filter and sort containers
    const filteredAndSortedContainers = containers
        .filter(container =>
            Object.values(container).some(value =>
                value.toLowerCase().includes(searchTerm.toLowerCase())
            )
        )
        .sort((a, b) => {
            if (!sortConfig.key) return 0;

            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (sortConfig.direction === 'asc') {
                return aValue.localeCompare(bValue);
            }
            return bValue.localeCompare(aValue);
        });

    // Render sort indicator
    const renderSortIndicator = key => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    };

    return (
        <div className='space-y-4'>
            {/* Search bar */}
            <div className='relative'>
                <input
                    type='text'
                    placeholder='Search containers...'
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className='w-full px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
                />
            </div>

            {/* Container table */}
            <div className='overflow-x-auto rounded-lg'>
                <table className='min-w-full bg-gray-800/80 backdrop-blur-sm'>
                    <thead>
                        <tr>
                            <th className='p-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>
                                <button
                                    className='hover:text-white focus:outline-none'
                                    onClick={() => handleSort('names')}
                                >
                                    Name{renderSortIndicator('names')}
                                </button>
                            </th>
                            <th className='p-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>
                                <button
                                    className='hover:text-white focus:outline-none'
                                    onClick={() => handleSort('status')}
                                >
                                    Status{renderSortIndicator('status')}
                                </button>
                            </th>
                            <th className='p-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider'>
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className='divide-y divide-gray-700'>
                        {filteredAndSortedContainers.map((container, index) => (
                            <React.Fragment key={container.id}>
                                <tr className='hover:bg-gray-700/50'>
                                    <td className='p-3 text-sm text-white'>
                                        {container.names}
                                    </td>
                                    <td className='p-3 text-sm'>
                                        <span
                                            className={`px-2 py-1 rounded-full text-xs ${
                                                container.status
                                                    .toLowerCase()
                                                    .includes('up')
                                                    ? 'bg-green-500/20 text-green-300'
                                                    : 'bg-yellow-500/20 text-yellow-300'
                                            }`}
                                        >
                                            {container.status}
                                        </span>
                                    </td>
                                    <td className='p-3 text-sm'>
                                        <button
                                            onClick={() =>
                                                toggleRowExpansion(index)
                                            }
                                            className='text-blue-400 hover:text-blue-300 focus:outline-none'
                                        >
                                            {expandedRows.has(index)
                                                ? 'Hide Details'
                                                : 'Show Details'}
                                        </button>
                                    </td>
                                </tr>
                                {expandedRows.has(index) && (
                                    <tr className='bg-gray-900/50'>
                                        <td colSpan='3' className='p-4'>
                                            <div className='grid grid-cols-2 gap-4 text-sm'>
                                                <div>
                                                    <p className='text-gray-400'>
                                                        Container ID
                                                    </p>
                                                    <p className='text-white'>
                                                        {container.id}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className='text-gray-400'>
                                                        Image
                                                    </p>
                                                    <p className='text-white'>
                                                        {container.image}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className='text-gray-400'>
                                                        Created
                                                    </p>
                                                    <p className='text-white'>
                                                        {container.createdat}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className='text-gray-400'>
                                                        Ports
                                                    </p>
                                                    <p className='text-white'>
                                                        {container.ports ||
                                                            'None'}
                                                    </p>
                                                </div>
                                                {container.mounts && (
                                                    <div className='col-span-2'>
                                                        <p className='text-gray-400'>
                                                            Mounts
                                                        </p>
                                                        <p className='text-white break-words'>
                                                            {container.mounts}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ContainerList;
