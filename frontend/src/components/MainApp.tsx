import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ContainerList } from './ContainerList';
import { ImageList } from './ImageList';
import Background from './Background';
import { ErrorBoundary } from './ErrorBoundary';
import { useImages } from '../hooks/useImages';
import { useWebSocket } from '../hooks/useWebSocket';
import { logger } from '../services/logging';
import { useContainerContext, useContainerOperations } from '../context/ContainerContext';
import CommandPalette from './CommandPalette';
import { HiOutlineCommandLine } from 'react-icons/hi2';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';
import '../App.css';

// No settings needed anymore

// Load active tab from localStorage or use default
const loadActiveTab = () => {
    const savedTab = localStorage.getItem('app-active-tab');
    return (savedTab === 'containers' || savedTab === 'images') ? savedTab : 'containers';
};

// CommandPalettePortal component to render the CommandPalette in a portal
const CommandPalettePortal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSearch: (query: string) => void;
    commands: Array<{
        id: string;
        name: string;
        shortcut?: string;
        description?: string;
        category?: string;
        action: () => void;
    }>;
}> = ({ isOpen, onClose, onSearch, commands }) => {
    return ReactDOM.createPortal(
        <CommandPalette
            isOpen={isOpen}
            onClose={onClose}
            onSearch={onSearch}
            commands={commands}
        />,
        document.body
    );
};

function MainApp() {
    const { state: { containers, isLoading: containersLoading, error: containersError } } = useContainerContext();
    const { setContainers, updateContainer, deleteContainer, setLoading, setError } = useContainerOperations();
    const { images, refresh: refreshImages } = useImages();
    const [activeTab, setActiveTab] = useState<'containers' | 'images'>(loadActiveTab);
    const [wsError, setWsError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
    const { theme, toggleTheme } = useTheme();
    const [highlightedItem, setHighlightedItem] = useState<{ type: string; id: string; timestamp: number } | null>(null);

    // Set up WebSocket handlers
    useWebSocket({
        enabled: activeTab === 'containers',
        onContainerStateChange: (containerData) => {
            logger.info('Received container state update:', containerData);
            if (containerData.state === 'deleted') {
                deleteContainer(containerData.container_id);
            } else {
                updateContainer({
                    id: containerData.container_id,
                    name: containerData.name,
                    image: containerData.image,
                    status: containerData.status,
                    state: containerData.state,
                    ports: containerData.ports,
                    compose_project: containerData.compose_project || null,
                    compose_service: containerData.compose_service || null,
                    created: containerData.created
                });
            }
        },
        onInitialState: (containers) => {
            logger.info('Received initial container states:', containers);
            setContainers(containers.map(c => ({
                id: c.container_id,
                name: c.name,
                image: c.image,
                status: c.status,
                state: c.state,
                ports: c.ports,
                compose_project: c.compose_project || null,
                compose_service: c.compose_service || null,
                created: c.created
            })));
        },
        onError: (error) => {
            logger.error('WebSocket error:', new Error(error));
            setWsError(error);
            setError(error);
        }
    });

    // No settings needed anymore

    // Handle command palette search - memoized to prevent unnecessary re-renders
    const handleCommandSearch = useCallback((query: string) => {
        // Set the search term and close the palette
        setSearchTerm(query);
        setCommandPaletteOpen(false);
    }, []);

    // Toggle command palette - memoized to prevent unnecessary re-renders
    const toggleCommandPalette = useCallback(() => {
        setCommandPaletteOpen(prev => !prev);
    }, []);

    // Close command palette - memoized to prevent unnecessary re-renders
    const closeCommandPalette = useCallback(() => {
        setCommandPaletteOpen(false);
    }, []);

    // Generate container and image search options
    const containerOptions = useMemo(() => {
        if (!containers || containers.length === 0) return [];

        return containers.map(container => ({
            id: `container-${container.id}`,
            name: `Container: ${container.name}`,
            description: `${container.image} (${container.status})`,
            category: 'Containers',
            action: () => {
                setActiveTab('containers');
                localStorage.setItem('app-active-tab', 'containers');
                // Instead of filtering, set a highlight ID
                setHighlightedItem({
                    type: 'container',
                    id: container.id,
                    timestamp: Date.now()
                });
            }
        }));
    }, [containers, setActiveTab]);

    const imageOptions = useMemo(() => {
        if (!images || images.length === 0) return [];

        return images.map(image => ({
            id: `image-${image.id}`,
            name: `Image: ${image.tags[0] || image.id.substring(7, 19)}`,
            description: `${image.tags.length > 1 ? `${image.tags.length} tags` : ''}`,
            category: 'Images',
            action: () => {
                setActiveTab('images');
                localStorage.setItem('app-active-tab', 'images');
                // Instead of filtering, set a highlight ID
                setHighlightedItem({
                    type: 'image',
                    id: image.id,
                    timestamp: Date.now()
                });
            }
        }));
    }, [images, setActiveTab]);

    // Define commands for the command palette
    const commands = useMemo(() => [
        // Command options
        {
            id: 'containers-tab',
            name: 'Switch to Containers tab',
            shortcut: 'Ctrl + Shift + C',
            category: 'Navigation',
            action: () => {
                setActiveTab('containers');
                localStorage.setItem('app-active-tab', 'containers');
            }
        },
        {
            id: 'images-tab',
            name: 'Switch to Images tab',
            shortcut: 'Ctrl + Shift + I',
            category: 'Navigation',
            action: () => {
                setActiveTab('images');
                localStorage.setItem('app-active-tab', 'images');
            }
        },
        {
            id: 'toggle-theme',
            name: 'Toggle dark/light mode',
            shortcut: 'Ctrl + D',
            category: 'Appearance',
            action: toggleTheme
        },
        {
            id: 'refresh',
            name: 'Refresh current view',
            shortcut: 'Ctrl + R',
            category: 'Actions',
            action: () => {
                if (activeTab === 'containers') {
                    setLoading(true);
                    // The WebSocket will handle the refresh through the initial_state event
                } else {
                    refreshImages();
                }
            }
        },
        {
            id: 'clear-search',
            name: 'Clear search',
            category: 'Actions',
            action: () => {
                setSearchTerm('');
            }
        },
        // Include container and image options
        ...containerOptions,
        ...imageOptions
    ], [containerOptions, imageOptions, setActiveTab, toggleTheme, refreshImages, setLoading, activeTab]);

    // Add keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Ctrl+R for refresh
            if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
                event.preventDefault();
                if (activeTab === 'containers') {
                    setLoading(true);
                    // The WebSocket will handle the refresh through the initial_state event
                } else {
                    refreshImages();
                }
            }

            // Ctrl+Shift+C for Containers tab
            if (event.ctrlKey && event.shiftKey && event.key === 'C') {
                event.preventDefault();
                setActiveTab('containers');
                localStorage.setItem('app-active-tab', 'containers');
            }

            // Ctrl+Shift+I for Images tab
            if (event.ctrlKey && event.shiftKey && event.key === 'I') {
                event.preventDefault();
                setActiveTab('images');
                localStorage.setItem('app-active-tab', 'images');
            }

            // Ctrl+D for toggling dark mode
            if (event.ctrlKey && event.key === 'd') {
                event.preventDefault();
                toggleTheme();
            }

            // Ctrl+K for command palette
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                toggleCommandPalette();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeTab, refreshImages, setLoading, toggleTheme, toggleCommandPalette]);

    return (
        <div className="flex flex-col h-screen">
            <Background />
            <ErrorBoundary>
                <header className="relative z-10 py-4 px-6 flex items-center justify-between shadow-md dark:shadow-gray-800">
                    <div className="flex items-center">
                        <h1 className="text-2xl font-bold mr-8 dark:text-white">Docker Web Interface</h1>
                        <div className="flex space-x-1">
                            <button
                                onClick={() => {
                                    setActiveTab('containers');
                                    localStorage.setItem('app-active-tab', 'containers');
                                }}
                                className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'containers'
                                    ? 'bg-blue-500 text-white'
                                    : 'hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300'
                                    }`}
                            >
                                Containers
                            </button>
                            <button
                                onClick={() => {
                                    setActiveTab('images');
                                    localStorage.setItem('app-active-tab', 'images');
                                }}
                                className={`px-4 py-2 rounded-md transition-colors ${activeTab === 'images'
                                    ? 'bg-blue-500 text-white'
                                    : 'hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300'
                                    }`}
                            >
                                Images
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={toggleCommandPalette}
                            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
                            title="Command Palette (Ctrl+K)"
                        >
                            <HiOutlineCommandLine className="w-5 h-5" />
                            <span className="ml-1 text-sm hidden sm:inline">Ctrl+K</span>
                        </button>
                        <ThemeToggle />
                    </div>
                </header>

                <main className="flex-1 overflow-hidden relative z-0">
                    <div className="container mx-auto px-4 py-6 max-w-6xl h-full overflow-auto">
                        {activeTab === 'containers' ? (
                            <ContainerList
                                containers={containers}
                                isLoading={containersLoading}
                                error={containersError}
                                searchTerm={searchTerm}
                                highlightedItem={highlightedItem && highlightedItem.type === 'container' ? highlightedItem : null}
                            />
                        ) : (
                            <ImageList
                                searchTerm={searchTerm}
                                highlightedItem={highlightedItem && highlightedItem.type === 'image' ? highlightedItem : null}
                            />
                        )}
                    </div>
                </main>

                {wsError && (
                    <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg">
                        {wsError}
                    </div>
                )}

                {/* Render CommandPalette in a portal to isolate it from the main component tree */}
                <CommandPalettePortal
                    isOpen={commandPaletteOpen}
                    onClose={closeCommandPalette}
                    onSearch={handleCommandSearch}
                    commands={commands}
                />
            </ErrorBoundary>
        </div>
    );
}

export default MainApp;
