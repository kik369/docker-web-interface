import React, { useRef, useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

interface CommandOption {
    id: string;
    name: string;
    shortcut?: string;
    description?: string;
    category?: string;
    action: () => void;
    icon?: string;
    status?: 'running' | 'stopped' | 'none';
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onSearch?: (query: string) => void;
    commands: CommandOption[];
}

// Use React.memo to prevent unnecessary re-renders
const CommandPalette: React.FC<CommandPaletteProps> = React.memo(({
    isOpen,
    onClose,
    onSearch,
    commands
}) => {
    const { theme } = useTheme();
    const inputRef = useRef<HTMLInputElement>(null);
    const resultsContainerRef = useRef<HTMLDivElement>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Reset state when opened/closed
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setSelectedIndex(0);
        }
    }, [isOpen]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Filter commands based on search query
    const filteredCommands = commands.filter(command => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            command.name.toLowerCase().includes(query) ||
            (command.shortcut && command.shortcut.toLowerCase().includes(query)) ||
            (command.description && command.description.toLowerCase().includes(query)) ||
            (command.category && command.category.toLowerCase().includes(query))
        );
    });

    // Group commands by category
    const groupedCommands = filteredCommands.reduce<Record<string, CommandOption[]>>((acc, command) => {
        const category = command.category || 'Commands';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(command);
        return acc;
    }, {});

    // Create a flat list of commands with category headers for keyboard navigation
    const flattenedCommands = Object.entries(groupedCommands).flatMap(([category, commands]) => {
        return commands;
    });

    // Handle keyboard events
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'Enter') {
            if (flattenedCommands.length > 0) {
                flattenedCommands[selectedIndex].action();
                onClose();
            } else if (onSearch && searchQuery) {
                onSearch(searchQuery);
                onClose();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev =>
                prev < flattenedCommands.length - 1 ? prev + 1 : prev
            );
            ensureSelectedItemVisible();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
            ensureSelectedItemVisible();
        }
    };

    // Ensure the selected item is visible in the scrollable container
    const ensureSelectedItemVisible = () => {
        requestAnimationFrame(() => {
            const selectedElement = document.getElementById(`command-item-${selectedIndex}`);
            if (selectedElement && resultsContainerRef.current) {
                const container = resultsContainerRef.current;
                const containerRect = container.getBoundingClientRect();
                const selectedRect = selectedElement.getBoundingClientRect();

                if (selectedRect.bottom > containerRect.bottom) {
                    // If selected item is below visible area
                    container.scrollTop += selectedRect.bottom - containerRect.bottom;
                } else if (selectedRect.top < containerRect.top) {
                    // If selected item is above visible area
                    container.scrollTop -= containerRect.top - selectedRect.top;
                }
            }
        });
    };

    // Handle search query changes
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setSelectedIndex(0); // Reset selection when query changes
    };

    // Get icon component based on icon name
    const getIconComponent = (iconName: string) => {
        switch (iconName) {
            case 'container':
                return (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 3H4C2.89543 3 2 3.89543 2 5V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V5C22 3.89543 21.1046 3 20 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8 10H16M8 14H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                );
            case 'image':
                return (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                        <path d="M21 15L16 10L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                );
            case 'refresh':
                return (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 4V9H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M20 20V15H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M21 12C21 7.02944 16.9706 3 12 3C9.3345 3 6.93964 4.15875 5.29168 6M3 12C3 16.9706 7.02944 21 12 21C14.6655 21 17.0604 19.8412 18.7083 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                );
            case 'toggle':
                return (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 6H7C4.23858 6 2 8.23858 2 11C2 13.7614 4.23858 16 7 16H17C19.7614 16 22 13.7614 22 11C22 8.23858 19.7614 6 17 6Z" stroke="currentColor" strokeWidth="2" />
                        <circle cx="17" cy="11" r="3" fill="currentColor" />
                    </svg>
                );
            case 'search':
                return (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                );
            case 'logs':
                return (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M7 7H17M7 12H17M7 17H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                );
            default:
                return null;
        }
    };

    // Status indicator component
    const StatusIndicator = ({ status }: { status?: 'running' | 'stopped' | 'none' }) => {
        if (!status || status === 'none') return null;

        return (
            <span className={`w-2 h-2 rounded-full mr-2 ${status === 'running' ? 'bg-green-500' : 'bg-red-500'
                }`}></span>
        );
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop with blur effect */}
            <div
                className={`fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm z-40 transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Command palette container - positioned in the center with equal spacing */}
            <div
                className={`fixed inset-0 flex items-center justify-center z-50 px-4 transition-all ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
                    } ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="command-palette-title"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <div
                    className={`w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col ${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                        }`}
                    style={{ maxHeight: 'calc(100vh - 160px)' }}
                >
                    {/* Search input - enhanced styling */}
                    <div className={`relative flex-shrink-0 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
                        }`}>
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <svg
                                className={`h-5 w-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                aria-hidden="true"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </div>
                        <input
                            id="command-palette-title"
                            ref={inputRef}
                            type="text"
                            value={searchQuery}
                            onChange={handleSearchChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a command or search..."
                            className={`w-full pl-12 pr-4 py-4 text-lg focus:outline-none ${theme === 'dark'
                                ? 'bg-gray-900 text-white placeholder-gray-400 border-b border-gray-700'
                                : 'bg-gray-50 text-gray-900 placeholder-gray-500 border-b border-gray-200'
                                }`}
                            aria-label="Search command palette"
                        />
                    </div>

                    {/* Results container - with improved styling */}
                    <div
                        ref={resultsContainerRef}
                        className="overflow-y-auto flex-grow"
                        style={{ overscrollBehavior: 'contain' }}
                    >
                        {Object.keys(groupedCommands).length > 0 ? (
                            <div className="py-2">
                                {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
                                    <div key={category} className="mb-2">
                                        <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-gray-400 bg-gray-800' : 'text-gray-500 bg-gray-50'
                                            }`}>
                                            {category}
                                        </div>
                                        {categoryCommands.map((command) => {
                                            const commandIndex = flattenedCommands.findIndex(cmd => cmd.id === command.id);
                                            const isSelected = commandIndex === selectedIndex;

                                            return (
                                                <div
                                                    id={`command-item-${commandIndex}`}
                                                    key={command.id}
                                                    className={`px-4 py-3 cursor-pointer ${isSelected
                                                        ? theme === 'dark'
                                                            ? 'bg-gray-700'
                                                            : 'bg-blue-50'
                                                        : ''
                                                        } hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-blue-50'}`}
                                                    onClick={() => {
                                                        command.action();
                                                        onClose();
                                                    }}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center">
                                                            {command.status && <StatusIndicator status={command.status} />}
                                                            {command.icon && (
                                                                <span className={`mr-3 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                                                    }`}>
                                                                    {getIconComponent(command.icon)}
                                                                </span>
                                                            )}
                                                            <span className="font-medium">{command.name}</span>
                                                        </div>
                                                        {command.shortcut && (
                                                            <div className="flex space-x-1">
                                                                {command.shortcut.split(' + ').map((key, index) => (
                                                                    <React.Fragment key={index}>
                                                                        {index > 0 && <span className="text-gray-400">+</span>}
                                                                        <span className={`inline-flex items-center justify-center rounded min-w-[1.5rem] h-6 px-1.5 text-xs font-medium ${theme === 'dark'
                                                                            ? 'bg-gray-700 text-gray-300 border border-gray-600'
                                                                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                                                                            }`}>
                                                                            {key}
                                                                        </span>
                                                                    </React.Fragment>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {command.description && (
                                                        <div className={`text-sm mt-1 ml-10 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                                            }`}>
                                                            {command.description}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        ) : searchQuery ? (
                            <div className="px-4 py-8 text-center text-gray-500">
                                <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <p>No commands found. Press Enter to search for "{searchQuery}".</p>
                            </div>
                        ) : (
                            <div className="px-4 py-8 text-center text-gray-500">
                                <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <p>Type to search for commands or containers/images</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}, (prevProps, nextProps) => {
    // Custom comparison function to prevent unnecessary re-renders
    // Only re-render if isOpen state changes or commands change
    return prevProps.isOpen === nextProps.isOpen &&
        prevProps.commands === nextProps.commands;
});

export default CommandPalette;
