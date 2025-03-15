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
import { HiOutlineCube, HiOutlineTemplate } from 'react-icons/hi';
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
        icon?: string;
        status?: 'running' | 'stopped' | 'none';
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
            icon: 'container',
            status: container.state === 'running' ? 'running' : 'stopped',
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
            icon: 'image',
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
            icon: 'container',
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
            icon: 'image',
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
            icon: 'toggle',
            action: toggleTheme
        },
        {
            id: 'close-all-logs',
            name: 'Close All Logs',
            shortcut: 'Ctrl + Shift + L',
            category: 'Actions',
            icon: 'logs',
            action: () => {
                // Close all logs by clearing localStorage entries that start with the logs prefix
                const LOGS_STORAGE_KEY_PREFIX = 'dockerWebInterface_logsViewed_';

                // Get all keys from localStorage
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(LOGS_STORAGE_KEY_PREFIX)) {
                        keys.push(key);
                    }
                }

                // Set all log view states to false
                keys.forEach(key => {
                    localStorage.setItem(key, 'false');
                });

                // Force a re-render of the container list to apply changes
                setLoading(true);
                setTimeout(() => setLoading(false), 100);

                logger.info('Closed all container logs');
            }
        },
        // Include container and image options
        ...containerOptions,
        ...imageOptions
    ], [containerOptions, imageOptions, setActiveTab, toggleTheme, setLoading]);

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

            // Ctrl+Shift+L for closing all logs
            if (event.ctrlKey && event.shiftKey && event.key === 'L') {
                event.preventDefault();
                // Close all logs by clearing localStorage entries that start with the logs prefix
                const LOGS_STORAGE_KEY_PREFIX = 'dockerWebInterface_logsViewed_';

                // Get all keys from localStorage
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(LOGS_STORAGE_KEY_PREFIX)) {
                        keys.push(key);
                    }
                }

                // Set all log view states to false
                keys.forEach(key => {
                    localStorage.setItem(key, 'false');
                });

                // Force a re-render of the container list to apply changes
                setLoading(true);
                setTimeout(() => setLoading(false), 100);

                logger.info('Closed all container logs via keyboard shortcut');
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
                <header className="relative z-10 py-3">
                    <div className="container mx-auto px-4 max-w-6xl border-b border-gray-200 dark:border-gray-800 pb-3">
                        <nav className="flex items-center justify-between">
                            <div className="flex items-center">
                                <h1 className="text-2xl font-bold mr-8 dark:text-white font-mono">docker_web_interface</h1>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => {
                                            setActiveTab('containers');
                                            localStorage.setItem('app-active-tab', 'containers');
                                        }}
                                        className={`px-4 py-2 rounded-md transition-colors font-mono text-sm flex items-center ${activeTab === 'containers'
                                            ? 'bg-gray-700 text-white dark:bg-gray-700 dark:text-white'
                                            : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                                            }`}
                                    >
                                        <HiOutlineCube className="w-4 h-4 mr-2 text-blue-300" />
                                        containers
                                    </button>
                                    <button
                                        onClick={() => {
                                            setActiveTab('images');
                                            localStorage.setItem('app-active-tab', 'images');
                                        }}
                                        className={`px-4 py-2 rounded-md transition-colors font-mono text-sm flex items-center ${activeTab === 'images'
                                            ? 'bg-gray-700 text-white dark:bg-gray-700 dark:text-white'
                                            : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                                            }`}
                                    >
                                        <HiOutlineTemplate className="w-4 h-4 mr-2 text-purple-300" />
                                        images
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <button
                                    onClick={toggleCommandPalette}
                                    className={`px-4 py-2 rounded-md transition-colors font-mono text-sm flex items-center bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700`}
                                    title="Command Palette (Ctrl+K)"
                                >
                                    <HiOutlineCommandLine className="w-4 h-4 mr-2 text-blue-300" />
                                    <span className="font-mono">ctrl+k</span>
                                </button>
                                <ThemeToggle />
                            </div>
                        </nav>
                    </div>
                </header>

                <main className="flex-1 overflow-auto relative z-0 pt-4">
                    <div className="container mx-auto px-4 max-w-6xl pb-4">
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
