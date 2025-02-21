import React, { useEffect, useState, useCallback } from 'react';
import { ContainerList } from './components/ContainerList';
import Background from './components/Background';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Settings } from './components/Settings';
import { useContainers } from './hooks/useContainers';
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

function App() {
    const { containers, isLoading, error, refresh } = useContainers();
    const [settings, setSettings] = useState(loadSettings);
    const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(settings.refreshInterval);

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

    const handleSettingsSave = async (newSettings: { refreshInterval: number, rateLimit: number }) => {
        try {
            const roundedSettings = {
                ...newSettings,
                refreshInterval: Math.max(5, Math.round(newSettings.refreshInterval))
            };

            // Update both settings in the backend
            await Promise.all([
                updateRateLimit(roundedSettings.rateLimit),
                updateRefreshInterval(roundedSettings.refreshInterval)
            ]);

            // Update local settings
            setSettings(roundedSettings);
            localStorage.setItem('app-settings', JSON.stringify(roundedSettings));
            setSecondsUntilRefresh(roundedSettings.refreshInterval);
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    };

    // Combine refresh and countdown into a single effect
    useEffect(() => {
        let lastRefreshTime = Date.now();

        const intervalId = setInterval(async () => {
            const now = Date.now();
            const timeSinceLastRefresh = Math.floor((now - lastRefreshTime) / 1000);
            const nextRefresh = settings.refreshInterval - timeSinceLastRefresh;

            if (nextRefresh <= 0) {
                console.log('Triggering refresh...');
                await refresh();
                lastRefreshTime = Date.now(); // Update after refresh completes
                setSecondsUntilRefresh(settings.refreshInterval);
                console.log('Refresh complete, reset timer');
            } else {
                setSecondsUntilRefresh(nextRefresh);
            }
        }, 1000);

        // Initial refresh
        refresh();

        return () => clearInterval(intervalId);
    }, [refresh, settings.refreshInterval]);

    const handleManualRefresh = useCallback(async () => {
        console.log('Manual refresh triggered');
        await refresh();
        setSecondsUntilRefresh(settings.refreshInterval);
    }, [refresh, settings.refreshInterval]);

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
        <ErrorBoundary>
            <div className='min-h-screen'>
                <Background />
                <div className='container mx-auto p-4 relative'>
                    <div className='flex justify-between items-center mb-4'>
                        <h1 className='text-3xl font-bold text-white'>
                            Docker Container Management
                        </h1>
                        <div className='flex items-center space-x-4'>
                            <span className='text-sm text-gray-300'>
                                Next refresh in {Math.max(0, Math.round(secondsUntilRefresh))}s
                            </span>
                            <Settings onSave={handleSettingsSave} currentSettings={settings} />
                        </div>
                    </div>
                    <ContainerList
                        containers={containers}
                        isLoading={isLoading}
                        error={error}
                    />
                </div>
            </div>
        </ErrorBoundary>
    );
}

export default App;
