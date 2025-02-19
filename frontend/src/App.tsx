import React, { useEffect } from 'react';
import { ContainerList } from './components/ContainerList';
import Background from './components/Background';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useContainers } from './hooks/useContainers';
import './App.css';

function App() {
    const { containers, isLoading, error, refresh } = useContainers();

    useEffect(() => {
        const interval = setInterval(refresh, 30000);
        return () => clearInterval(interval);
    }, [refresh]);

    return (
        <ErrorBoundary>
            <div className='min-h-screen'>
                <Background />
                <div className='container mx-auto p-4 relative'>
                    <div className='flex justify-between items-center mb-4'>
                        <h1 className='text-3xl font-bold text-white'>
                            Running Docker Containers
                        </h1>
                        <button
                            onClick={refresh}
                            className='px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors'
                        >
                            Refresh
                        </button>
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
