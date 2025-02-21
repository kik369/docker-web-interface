import React, { useEffect, useState, useCallback } from 'react';
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
            refreshInterval: Math.round(parsed.refreshInterval),
            rateLimit: parsed.rateLimit
        };
    }
    return {
        refreshInterval: 30, // Default 30 seconds
        rateLimit: 1000 // Default rate limit
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
                const roundedSettings = {
                    ...backendSettings,
                    refreshInterval: Math.round(backendSettings.refreshInterval)
                };
                setSettings(roundedSettings);
                setSecondsUntilRefresh(roundedSettings.refreshInterval);
                localStorage.setItem('app-settings', JSON.stringify(roundedSettings));
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
            const roundedSettings = {
                ...newSettings,
                refreshInterval: Math.round(newSettings.refreshInterval)
            };
            setSettings(roundedSettings);
            localStorage.setItem('app-settings', JSON.stringify(roundedSettings));
            setSecondsUntilRefresh(roundedSettings.refreshInterval);
        } catch (error) {
            console.error('Failed to save settings:', error);
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
                    refresh();
                    return settings.refreshInterval;
                }
                return Math.max(0, prev - 1);
            });
        }, 1000);

        return () => {
            clearInterval(refreshInterval);
            clearInterval(countdownInterval);
        };
    }, [refresh, settings.refreshInterval]);

    const handleManualRefresh = useCallback(() => {
        refresh();
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
                            Running Docker Containers
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
