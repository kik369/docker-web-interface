import React, { useRef, useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

interface CommandOption {
    id: string;
    name: string;
    shortcut?: string;
    description?: string;
    category?: string;
    action: () => void;
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
    const [maxHeight, setMaxHeight] = useState('auto');

    // Reset state when opened/closed
    useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setSelectedIndex(0);
            // Calculate available height when opened
            calculateMaxHeight();
        }
    }, [isOpen]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Calculate maximum height based on viewport
    const calculateMaxHeight = () => {
        const viewportHeight = window.innerHeight;
        // Leave small gaps at top and bottom (80px at top, 40px at bottom)
        const topGap = 80;
        const bottomGap = 40;
        const availableHeight = viewportHeight - topGap - bottomGap;
        setMaxHeight(`${availableHeight}px`);
    };

    // Recalculate height on window resize
    useEffect(() => {
        if (!isOpen) return;

        const handleResize = () => {
            calculateMaxHeight();
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
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

            {/* Command palette container - positioned with a gap from the top */}
            <div
                className={`fixed top-20 left-1/2 transform -translate-x-1/2 w-full max-w-2xl z-50 transition-all ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
                    } ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="command-palette-title"
                style={{ maxHeight: maxHeight }}
            >
                <div
                    className={`rounded-lg shadow-2xl overflow-hidden flex flex-col ${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                        }`}
                    style={{ maxHeight: '100%' }}
                >
                    {/* Search input */}
                    <div className="relative flex-shrink-0">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
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
                            className={`w-full pl-10 pr-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark'
                                ? 'bg-gray-800 text-white placeholder-gray-400'
                                : 'bg-white text-gray-900 placeholder-gray-500'
                                }`}
                            aria-label="Search command palette"
                        />
                    </div>

                    {/* Results container - now with dynamic height */}
                    <div
                        ref={resultsContainerRef}
                        className="overflow-y-auto flex-grow"
                        style={{ overscrollBehavior: 'contain' }}
                    >
                        {Object.keys(groupedCommands).length > 0 ? (
                            <div className="py-2">
                                {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
                                    <div key={category}>
                                        <div className={`px-4 py-1 text-xs font-semibold ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
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
                                                    className={`px-4 py-2 cursor-pointer ${isSelected
                                                        ? theme === 'dark'
                                                            ? 'bg-gray-700'
                                                            : 'bg-gray-100'
                                                        : ''
                                                        } hover:${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}
                                                    onClick={() => {
                                                        command.action();
                                                        onClose();
                                                    }}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium">{command.name}</span>
                                                        {command.shortcut && (
                                                            <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-mono ${theme === 'dark'
                                                                ? 'bg-gray-600 text-gray-300'
                                                                : 'bg-gray-200 text-gray-700'
                                                                }`}>
                                                                {command.shortcut}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {command.description && (
                                                        <div className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
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
                                No commands found. Press Enter to search for "{searchQuery}".
                            </div>
                        ) : (
                            <div className="px-4 py-8 text-center text-gray-500">
                                Type to search for commands or containers/images
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
