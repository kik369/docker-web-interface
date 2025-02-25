import React, { useEffect, useState } from 'react';
import { ContainerList } from './ContainerList';
import { ImageList } from './ImageList';
import Background from './Background';
import { ErrorBoundary } from './ErrorBoundary';
import { useImages } from '../hooks/useImages';
import { useWebSocket } from '../hooks/useWebSocket';
import { logger } from '../services/logging';
import { useContainerContext, useContainerOperations } from '../context/ContainerContext';
import { SearchBar } from './SearchBar';
import '../App.css';

// No settings needed anymore

// Load active tab from localStorage or use default
const loadActiveTab = () => {
    const savedTab = localStorage.getItem('app-active-tab');
    return (savedTab === 'containers' || savedTab === 'images') ? savedTab : 'containers';
};

function MainApp() {
    const { state: { containers, isLoading: containersLoading, error: containersError } } = useContainerContext();
    const { setContainers, updateContainer, deleteContainer, setLoading, setError } = useContainerOperations();
    const { refresh: refreshImages } = useImages();
    const [activeTab, setActiveTab] = useState<'containers' | 'images'>(loadActiveTab);
    const [wsError, setWsError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');

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
                    </div>
                </div>

                <div className="mb-6">
                    <div className="border-b border-gray-700 flex justify-between items-center">
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
                        <div className="w-64">
                            <SearchBar
                                value={searchTerm}
                                onChange={setSearchTerm}
                                placeholder={`Search ${activeTab}...`}
                            />
                        </div>
                    </div>
                </div>

                <ErrorBoundary>
                    {activeTab === 'containers' ? (
                        <ContainerList
                            containers={containers}
                            isLoading={containersLoading}
                            error={containersError || wsError}
                            searchTerm={searchTerm}
                        />
                    ) : (
                        <ImageList
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                        />
                    )}
                </ErrorBoundary>
            </div>
        </div>
    );
}

export default MainApp;
