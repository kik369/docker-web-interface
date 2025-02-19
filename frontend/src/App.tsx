import React, { useState, useEffect } from 'react';
import { ContainerList } from './components/ContainerList';
import Background from './components/Background';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Container } from './types/docker';
import { logger } from './services/logging';
import './App.css';

function App() {
    const [containers, setContainers] = useState<Container[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<'success' | 'loading' | 'error'>('loading');

    const fetchData = async () => {
        setLoading(true);
        setStatus('loading');
        try {
            const response = await fetch('http://localhost:5000/api/containers');
            const data = await response.json();
            setContainers(data.data);
            setError(null);
            setStatus('success');
            logger.info('Successfully fetched container data', { containerCount: data.data.length });
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to fetch containers';
            setError(errorMessage);
            setStatus('error');
            logger.error('Failed to fetch container data', err instanceof Error ? err : undefined);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

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
                            <div
                                className={`
                                    ${status === 'success' && 'text-green-400'}
                                    ${status === 'loading' && 'text-yellow-400'}
                                    ${status === 'error' && 'text-red-500'}
                                `}
                            >
                                ●
                            </div>
                            <button
                                className='bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded text-white'
                                onClick={fetchData}
                            >
                                Refresh
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className='bg-red-500 p-4 rounded mb-4'>
                            <p className='text-white'>{error}</p>
                        </div>
                    )}

                    {loading && (
                        <div className='flex justify-center my-4'>
                            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-white'></div>
                        </div>
                    )}

                    <ContainerList
                        containers={containers}
                        isLoading={loading}
                        error={error}
                    />
                </div>
            </div>
        </ErrorBoundary>
    );
}

export default App;
