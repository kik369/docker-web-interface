import React, { useEffect, useState } from 'react';
import { ContainerList } from './ContainerList';
import { ImageList } from './ImageList';
import Background from './Background';
import { ErrorBoundary } from './ErrorBoundary';
import { Settings } from './Settings';
import { useImages } from '../hooks/useImages';
import { useWebSocket } from '../hooks/useWebSocket';
import { getSettings, updateRateLimit } from '../services/settings';
import { logger } from '../services/logging';
import { useContainerContext, useContainerOperations } from '../context/ContainerContext';
import '../App.css';

// Load settings from localStorage or use defaults
const loadSettings = () => {
    const savedSettings = localStorage.getItem('app-settings');
    const defaultSettings = {
        rateLimit: 1000 // Default rate limit
    };

    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            return {
                rateLimit: Math.max(1, parsed.rateLimit) || defaultSettings.rateLimit
            };
        } catch (e) {
            return defaultSettings;
        }
    }
    return defaultSettings;
};

// Load active tab from localStorage or use default
const loadActiveTab = () => {
    const savedTab = localStorage.getItem('app-active-tab');
    return (savedTab === 'containers' || savedTab === 'images') ? savedTab : 'containers';
};

function MainApp() {
    const { state: { containers, isLoading: containersLoading, error: containersError } } = useContainerContext();
    const { setContainers, updateContainer, deleteContainer, setLoading, setError } = useContainerOperations();
    const { images, isLoading: imagesLoading, error: imagesError, refresh: refreshImages } = useImages();
    const [settings, setSettings] = useState(loadSettings);
    const [activeTab, setActiveTab] = useState<'containers' | 'images'>(loadActiveTab);
    const [wsError, setWsError] = useState<string | null>(null);

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

    // Fetch initial settings from the backend
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const backendSettings = await getSettings();
                setSettings({
                    rateLimit: Math.max(1, backendSettings.rateLimit)
                });
                localStorage.setItem('app-settings', JSON.stringify({
                    rateLimit: backendSettings.rateLimit
                }));
            } catch (error) {
                console.error('Failed to fetch settings:', error);
                // On error, keep using the local settings
                const localSettings = loadSettings();
                setSettings(localSettings);
            }
        };
        fetchSettings();
    }, []);

    // Add Ctrl+R handler for manual refresh
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
                event.preventDefault();
                if (activeTab === 'containers') {
                    setLoading(true);
                    // The WebSocket will handle the refresh through the initial_state event
                } else {
                    refreshImages();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [refreshImages, activeTab, setLoading]);

    return (
        <div className="min-h-screen text-white">
            <Background />
            <div className="container mx-auto px-4 py-8 relative z-10">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold">Docker Web Interface</h1>
                    <div className="flex items-center space-x-4">
                        {wsError && (
                            <span className="text-sm text-red-500">
                                WebSocket Error: {wsError}
                            </span>
                        )}
                        <Settings
                            rateLimit={settings.rateLimit}
                            refreshInterval={0} // Removed from UI but kept for compatibility
                            onRefreshIntervalChange={async () => { }} // Empty async function for compatibility
                            onRateLimitChange={async (newRateLimit) => {
                                await updateRateLimit(newRateLimit);
                                setSettings(prev => ({ ...prev, rateLimit: newRateLimit }));
                            }}
                        />
                    </div>
                </div>

                <div className="mb-6">
                    <div className="border-b border-gray-700">
                        <nav className="-mb-px flex space-x-8">
                            <button
                                onClick={() => {
                                    setActiveTab('containers');
                                    localStorage.setItem('app-active-tab', 'containers');
                                }}
                                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'containers'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                                    }`}
                            >
                                Containers
                            </button>
                            <button
                                onClick={() => {
                                    setActiveTab('images');
                                    localStorage.setItem('app-active-tab', 'images');
                                }}
                                className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'images'
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                                    }`}
                            >
                                Images
                            </button>
                        </nav>
                    </div>
                </div>

                <ErrorBoundary>
                    {activeTab === 'containers' ? (
                        <ContainerList
                            containers={containers}
                            isLoading={containersLoading}
                            error={containersError || wsError}
                        />
                    ) : (
                        <ImageList
                            images={images}
                            isLoading={imagesLoading}
                            error={imagesError}
                        />
                    )}
                </ErrorBoundary>
            </div>
        </div>
    );
}

export default MainApp;
