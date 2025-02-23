import React, { useEffect, useState, useCallback } from 'react';
import { ContainerList } from './components/ContainerList';
import { ImageList } from './components/ImageList';
import Background from './components/Background';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Settings } from './components/Settings';
import { useContainers } from './hooks/useContainers';
import { useImages } from './hooks/useImages';
import { getSettings, updateRateLimit, updateRefreshInterval } from './services/settings';
import './App.css';

// Load settings from localStorage or use defaults
const loadSettings = () => {
    const savedSettings = localStorage.getItem('app-settings');
    const defaultSettings = {
        refreshInterval: 30, // Default 30 seconds
        rateLimit: 1000 // Default rate limit
    };

    if (savedSettings) {
        try {
            const parsed = JSON.parse(savedSettings);
            return {
                refreshInterval: Math.max(5, Math.round(parsed.refreshInterval)) || defaultSettings.refreshInterval,
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

function App() {
    const { containers, isLoading: containersLoading, error: containersError, refresh: refreshContainers } = useContainers();
    const { images, isLoading: imagesLoading, error: imagesError, refresh: refreshImages } = useImages();
    const [settings, setSettings] = useState(loadSettings);
    const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(settings.refreshInterval);
    const [activeTab, setActiveTab] = useState<'containers' | 'images'>(loadActiveTab);

    // Fetch initial settings from the backend
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const backendSettings = await getSettings();
                const roundedSettings = {
                    ...backendSettings,
                    refreshInterval: Math.max(5, Math.round(backendSettings.refreshInterval))
                };
                setSettings(roundedSettings);
                setSecondsUntilRefresh(roundedSettings.refreshInterval);
                localStorage.setItem('app-settings', JSON.stringify(roundedSettings));
            } catch (error) {
                console.error('Failed to fetch settings:', error);
                // On error, keep using the local settings
                const localSettings = loadSettings();
                setSettings(localSettings);
                setSecondsUntilRefresh(localSettings.refreshInterval);
            }
        };
        fetchSettings();
    }, []);

    // Combine refresh and countdown into a single effect
    useEffect(() => {
        let lastRefreshTime = Date.now();

        const intervalId = setInterval(async () => {
            const now = Date.now();
            const timeSinceLastRefresh = Math.floor((now - lastRefreshTime) / 1000);
            const nextRefresh = settings.refreshInterval - timeSinceLastRefresh;

            if (nextRefresh <= 0) {
                console.log('Triggering refresh...');
                if (activeTab === 'containers') {
                    await refreshContainers();
                } else {
                    await refreshImages();
                }
                lastRefreshTime = Date.now(); // Update after refresh completes
                setSecondsUntilRefresh(settings.refreshInterval);
                console.log('Refresh complete, reset timer');
            } else {
                setSecondsUntilRefresh(nextRefresh);
            }
        }, 1000);

        // Initial refresh
        if (activeTab === 'containers') {
            refreshContainers();
        } else {
            refreshImages();
        }

        return () => clearInterval(intervalId);
    }, [refreshContainers, refreshImages, settings.refreshInterval, activeTab]);

    const handleManualRefresh = useCallback(async () => {
        console.log('Manual refresh triggered');
        if (activeTab === 'containers') {
            await refreshContainers();
        } else {
            await refreshImages();
        }
        setSecondsUntilRefresh(settings.refreshInterval);
    }, [refreshContainers, refreshImages, settings.refreshInterval, activeTab]);

    // Add Ctrl+R handler
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
                event.preventDefault();
                handleManualRefresh();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleManualRefresh]);

    return (
        <div className="min-h-screen text-white">
            <Background />
            <div className="container mx-auto px-4 py-8 relative z-10">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold">Docker Web Interface</h1>
                    <div className="flex items-center space-x-4">
                        <span className="text-sm text-gray-300">
                            Next refresh in {Math.max(0, Math.round(secondsUntilRefresh))}s
                        </span>
                        <Settings
                            refreshInterval={settings.refreshInterval}
                            rateLimit={settings.rateLimit}
                            onRefreshIntervalChange={async (newRefreshInterval) => {
                                await updateRefreshInterval(newRefreshInterval);
                                setSettings(prev => ({ ...prev, refreshInterval: newRefreshInterval }));
                                setSecondsUntilRefresh(newRefreshInterval);
                            }}
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
                            error={containersError}
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

export default App;
