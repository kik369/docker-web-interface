import React, { useState, useEffect, useCallback } from 'react';
import Background from './components/Background';
import { ContainerList } from './components/ContainerList';
import { Container } from './types/docker';

function App() {
    const [containers, setContainers] = useState<Container[]>([]);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('success');
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setStatus('loading');

        try {
            const response = await fetch(
                `${process.env.REACT_APP_API_URL}/api/containers`
            );
            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error || 'Failed to fetch container data'
                );
            }

            setContainers(result.data);
            setError('');
            setStatus('success');
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
            setError(errorMessage);
            setStatus('error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const timer = setInterval(
            fetchData,
            parseInt(process.env.REACT_APP_REFRESH_INTERVAL || '30') * 1000
        );
        return () => clearInterval(timer);
    }, [fetchData]);

    return (
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
                    onRefresh={fetchData}
                />
            </div>
        </div>
    );
}

export default App;
