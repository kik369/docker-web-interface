import React, { useEffect, useState } from 'react';
import { ContainerList } from './components/ContainerList';
import Background from './components/Background';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Settings } from './components/Settings';
import { useContainers } from './hooks/useContainers';
import { config } from './config';
import { getSettings, updateRateLimit } from './services/settings';
import './App.css';

// Load settings from localStorage or use defaults
const loadSettings = () => {
    const savedSettings = localStorage.getItem('app-settings');
    if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        return {
            refreshInterval: parsed.refreshInterval,
            rateLimit: parsed.rateLimit
        };
    }
    return {
        refreshInterval: config.REFRESH_INTERVAL / 1000,
        rateLimit: 60 // Default rate limit
    };
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
                setSettings(backendSettings);
                setSecondsUntilRefresh(backendSettings.refreshInterval);
                localStorage.setItem('app-settings', JSON.stringify(backendSettings));
            } catch (error) {
                console.error('Failed to fetch settings:', error);
            }
        };
        fetchSettings();
    }, []);

    const handleSettingsSave = async (newSettings: { refreshInterval: number, rateLimit: number }) => {
        try {
            // Update rate limit in the backend
            await updateRateLimit(newSettings.rateLimit);

            // Update local settings
            setSettings(newSettings);
            localStorage.setItem('app-settings', JSON.stringify(newSettings));
            setSecondsUntilRefresh(newSettings.refreshInterval);
        } catch (error) {
            console.error('Failed to save settings:', error);
            // Optionally show an error message to the user
        }
    };

    useEffect(() => {
        // Auto refresh interval
        const refreshInterval = setInterval(() => {
            refresh();
            setSecondsUntilRefresh(settings.refreshInterval);
        }, settings.refreshInterval * 1000);

        // Countdown interval
        const countdownInterval = setInterval(() => {
            setSecondsUntilRefresh((prev: number) => {
                if (prev <= 1) {
                    return settings.refreshInterval;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            clearInterval(refreshInterval);
            clearInterval(countdownInterval);
        };
    }, [refresh, settings.refreshInterval]);

    const handleManualRefresh = () => {
        refresh();
        setSecondsUntilRefresh(settings.refreshInterval);
    };

    return (
        <ErrorBoundary>
            <div className='min-h-screen'>
                <Background />
                <div className='container mx-auto p-4 relative'>
                    <div className='flex justify-between items-center mb-4'>
                        <h1 className='text-3xl font-bold text-white'>
                            Running Docker Containers
                        </h1>
                        <div className='flex items-center space-x-4'>
                            <button
                                onClick={handleManualRefresh}
                                className='px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors'
                            >
                                Refresh
                            </button>
                            <span className='text-sm text-gray-300'>
                                Refresh in {secondsUntilRefresh}s
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
