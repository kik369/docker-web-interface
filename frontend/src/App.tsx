import React, { useEffect, useState } from 'react';
import { ContainerList } from './components/ContainerList';
import Background from './components/Background';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useContainers } from './hooks/useContainers';
import { config } from './config';
import './App.css';

function App() {
    const { containers, isLoading, error, refresh } = useContainers();
    const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(config.REFRESH_INTERVAL / 1000);

    useEffect(() => {
        // Auto refresh interval
        const refreshInterval = setInterval(() => {
            refresh();
            setSecondsUntilRefresh(config.REFRESH_INTERVAL / 1000);
        }, config.REFRESH_INTERVAL);

        // Countdown interval
        const countdownInterval = setInterval(() => {
            setSecondsUntilRefresh((prev) => {
                if (prev <= 1) {
                    return config.REFRESH_INTERVAL / 1000;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            clearInterval(refreshInterval);
            clearInterval(countdownInterval);
        };
    }, [refresh]);

    const handleManualRefresh = () => {
        refresh();
        setSecondsUntilRefresh(config.REFRESH_INTERVAL / 1000);
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
