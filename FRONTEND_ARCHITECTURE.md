# Frontend Architecture

## Overview

This document details the architecture of the frontend for the Docker Web Interface application. The frontend is built using React with TypeScript, providing a responsive user interface for monitoring and managing Docker containers and images. The architecture follows modern React best practices including hooks, context API, and functional components.

## Core Technologies

-   **React**: UI library for building component-based interfaces
-   **TypeScript**: Adds static typing to improve development experience and code quality
-   **Socket.IO Client**: Enables real-time bidirectional communication with the backend
-   **React Router**: Handles client-side routing
-   **CSS Modules**: Scopes styles to components to avoid global namespace collisions

## Directory Structure

```
frontend/
├── public/                # Static assets and HTML template
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── common/        # Generic UI components
│   │   ├── container/     # Container-specific components
│   │   └── image/         # Image-specific components
│   ├── contexts/          # React context providers
│   ├── hooks/             # Custom React hooks
│   ├── pages/             # Page components for routing
│   ├── services/          # API service modules
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   ├── App.tsx            # Main application component
│   ├── index.tsx          # Application entry point
│   └── setupTests.ts      # Test configuration
├── package.json           # Dependencies and scripts
└── tsconfig.json          # TypeScript configuration
```

## Component Architecture

The frontend follows a hierarchical component structure:

```
App
├── Header
├── Sidebar
└── Pages (via Router)
    ├── Dashboard
    │   ├── ContainerList
    │   │   ├── ContainerRow
    │   │   │   ├── ContainerActions
    │   │   │   └── StatusIndicator
    │   │   └── Filters
    │   └── ResourceUsageGraph
    ├── ContainerDetail
    │   ├── ContainerInfo
    │   ├── LogViewer
    │   └── Actions
    ├── Images
    │   ├── ImageList
    │   └── ImageActions
    └── Settings
```

## State Management

### React Context

The application uses React Context API to manage global state:

```typescript
// src/contexts/ContainerContext.tsx
import React, { createContext, useReducer, useContext } from 'react';
import { Container } from '../types/container';

type ContainerState = {
    containers: Container[];
    loading: boolean;
    error: string | null;
};

const ContainerContext = createContext<{
    state: ContainerState;
    dispatch: React.Dispatch<any>;
}>({
    state: { containers: [], loading: false, error: null },
    dispatch: () => null,
});

const containerReducer = (
    state: ContainerState,
    action: any
): ContainerState => {
    switch (action.type) {
        case 'SET_CONTAINERS':
            return { ...state, containers: action.payload, loading: false };
        case 'ADD_CONTAINER':
            return {
                ...state,
                containers: [...state.containers, action.payload],
            };
        case 'UPDATE_CONTAINER':
            return {
                ...state,
                containers: state.containers.map(container =>
                    container.id === action.payload.id
                        ? action.payload
                        : container
                ),
            };
        case 'DELETE_CONTAINER':
            return {
                ...state,
                containers: state.containers.filter(
                    container => container.id !== action.payload
                ),
            };
        case 'SET_LOADING':
            return { ...state, loading: action.payload };
        case 'SET_ERROR':
            return { ...state, error: action.payload, loading: false };
        default:
            return state;
    }
};

export const ContainerProvider: React.FC = ({ children }) => {
    const [state, dispatch] = useReducer(containerReducer, {
        containers: [],
        loading: false,
        error: null,
    });

    return (
        <ContainerContext.Provider value={{ state, dispatch }}>
            {children}
        </ContainerContext.Provider>
    );
};

export const useContainerContext = () => useContext(ContainerContext);
```

Similar contexts exist for images and application settings.

### Local Component State

For component-specific state, React's `useState` and `useReducer` hooks are used:

```typescript
// src/components/container/ContainerRow.tsx
import React, { useState } from 'react';
import { Container } from '../../types/container';

interface ContainerRowProps {
    container: Container;
    onAction: (action: string, containerId: string) => void;
}

const ContainerRow: React.FC<ContainerRowProps> = ({ container, onAction }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);

    const toggleExpand = () => setIsExpanded(!isExpanded);
    const toggleActionMenu = () => setIsActionMenuOpen(!isActionMenuOpen);

    // Component rendering logic
};
```

## Data Fetching and WebSocket Integration

### REST API Integration

API calls use custom hooks that wrap fetch operations:

```typescript
// src/hooks/useApi.ts
import { useState, useCallback } from 'react';

export function useApi<T>(url: string) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const result = await response.json();
            setData(result.data);
        } catch (err) {
            setError(err.message || 'Unknown error occurred');
        } finally {
            setLoading(false);
        }
    }, [url]);

    return { data, loading, error, fetchData };
}
```

### WebSocket Integration

WebSocket communication is abstracted through a custom hook:

```typescript
// src/hooks/useWebSocket.ts
import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useContainerContext } from '../contexts/ContainerContext';
import { Container } from '../types/container';

export function useWebSocket() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const { dispatch } = useContainerContext();

    useEffect(() => {
        const socketInstance = io('http://localhost:5000', {
            transports: ['websocket'],
            reconnection: true,
        });

        socketInstance.on('connect', () => {
            setConnected(true);
        });

        socketInstance.on('disconnect', () => {
            setConnected(false);
        });

        // Handle initial container state
        socketInstance.on(
            'initial_state',
            (data: { containers: Container[] }) => {
                dispatch({ type: 'SET_CONTAINERS', payload: data.containers });
            }
        );

        // Handle container state updates
        socketInstance.on('container_state_change', (data: Container) => {
            if (data.state === 'removed') {
                dispatch({ type: 'DELETE_CONTAINER', payload: data.id });
            } else {
                dispatch({ type: 'UPDATE_CONTAINER', payload: data });
            }
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, [dispatch]);

    const startLogStream = useCallback(
        (containerId: string) => {
            if (socket && connected) {
                socket.emit('start_log_stream', { container_id: containerId });
            }
        },
        [socket, connected]
    );

    const stopLogStream = useCallback(
        (containerId: string) => {
            if (socket && connected) {
                socket.emit('stop_log_stream', { container_id: containerId });
            }
        },
        [socket, connected]
    );

    return {
        socket,
        connected,
        startLogStream,
        stopLogStream,
    };
}
```

## Routing

Routing is handled with React Router:

```typescript
// src/App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ContainerDetail from './pages/ContainerDetail';
import Images from './pages/Images';
import Settings from './pages/Settings';
import Header from './components/common/Header';
import Sidebar from './components/common/Sidebar';
import { ContainerProvider } from './contexts/ContainerContext';
import { ImageProvider } from './contexts/ImageContext';
import './App.css';

const App: React.FC = () => {
    return (
        <Router>
            <ContainerProvider>
                <ImageProvider>
                    <div className='app'>
                        <Header />
                        <div className='main-container'>
                            <Sidebar />
                            <main className='content'>
                                <Routes>
                                    <Route path='/' element={<Dashboard />} />
                                    <Route
                                        path='/containers/:id'
                                        element={<ContainerDetail />}
                                    />
                                    <Route
                                        path='/images'
                                        element={<Images />}
                                    />
                                    <Route
                                        path='/settings'
                                        element={<Settings />}
                                    />
                                </Routes>
                            </main>
                        </div>
                    </div>
                </ImageProvider>
            </ContainerProvider>
        </Router>
    );
};

export default App;
```

## Key UI Components

### Container Components

```typescript
// src/components/container/ContainerList.tsx
import React, { useEffect } from 'react';
import { useContainerContext } from '../../contexts/ContainerContext';
import ContainerRow from './ContainerRow';
import LoadingSpinner from '../common/LoadingSpinner';
import FilterBar from './FilterBar';
import { useApi } from '../../hooks/useApi';
import { Container } from '../../types/container';
import styles from './ContainerList.module.css';

const ContainerList: React.FC = () => {
    const { state, dispatch } = useContainerContext();
    const { fetchData, loading, error } =
        useApi<Container[]>('/api/containers');

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (error) {
            dispatch({ type: 'SET_ERROR', payload: error });
        }
    }, [error, dispatch]);

    if (loading) {
        return <LoadingSpinner />;
    }

    if (error) {
        return <div className={styles.error}>Error: {error}</div>;
    }

    return (
        <div className={styles.containerList}>
            <FilterBar />
            <div className={styles.listHeader}>
                <div>Name</div>
                <div>Image</div>
                <div>Status</div>
                <div>Created</div>
                <div>Ports</div>
                <div>Actions</div>
            </div>
            {state.containers.map(container => (
                <ContainerRow
                    key={container.id}
                    container={container}
                    onAction={handleContainerAction}
                />
            ))}
        </div>
    );
};

export default ContainerList;
```

### Log Viewer Component

```typescript
// src/components/container/LogViewer.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import styles from './LogViewer.module.css';

interface LogViewerProps {
    containerId: string;
}

const LogViewer: React.FC<LogViewerProps> = ({ containerId }) => {
    const [logs, setLogs] = useState<string[]>([]);
    const [autoScroll, setAutoScroll] = useState(true);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const { socket, startLogStream, stopLogStream } = useWebSocket();

    useEffect(() => {
        if (socket) {
            startLogStream(containerId);

            socket.on(
                'log_update',
                (data: { container_id: string; log: string }) => {
                    if (data.container_id === containerId) {
                        setLogs(prev => [...prev, data.log]);
                    }
                }
            );

            return () => {
                stopLogStream(containerId);
                socket.off('log_update');
            };
        }
    }, [socket, containerId, startLogStream, stopLogStream]);

    useEffect(() => {
        if (autoScroll && logContainerRef.current) {
            logContainerRef.current.scrollTop =
                logContainerRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    const toggleAutoScroll = () => setAutoScroll(!autoScroll);

    return (
        <div className={styles.logViewer}>
            <div className={styles.logHeader}>
                <h3>Container Logs</h3>
                <div className={styles.controls}>
                    <button onClick={toggleAutoScroll}>
                        {autoScroll
                            ? 'Disable Auto-scroll'
                            : 'Enable Auto-scroll'}
                    </button>
                    <button onClick={() => setLogs([])}>Clear</button>
                </div>
            </div>
            <div ref={logContainerRef} className={styles.logContainer}>
                {logs.length > 0 ? (
                    logs.map((log, index) => (
                        <div key={index} className={styles.logLine}>
                            {log}
                        </div>
                    ))
                ) : (
                    <div className={styles.emptyLogs}>No logs available</div>
                )}
            </div>
        </div>
    );
};

export default LogViewer;
```

## Error Handling

Error handling is implemented at various levels:

1. **API Calls**: Try-catch blocks around fetch operations
2. **Global Error Handling**: Error boundaries capture and display component errors
3. **WebSocket Errors**: Socket error events update the UI appropriately

```typescript
// src/components/common/ErrorBoundary.tsx
import React, { Component, ErrorInfo } from 'react';

interface ErrorBoundaryProps {
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    render(): React.ReactNode {
        if (this.state.hasError) {
            return (
                this.props.fallback || (
                    <div className='error-boundary'>
                        <h2>Something went wrong.</h2>
                        <p>{this.state.error?.message}</p>
                        <button
                            onClick={() =>
                                this.setState({ hasError: false, error: null })
                            }
                        >
                            Try again
                        </button>
                    </div>
                )
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
```

## Responsive Design

The UI adapts to different screen sizes using CSS media queries and flexible layouts:

```css
/* src/App.css */
.app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}

.main-container {
    display: flex;
    flex: 1;
}

.sidebar {
    width: 250px;
    flex-shrink: 0;
}

.content {
    flex: 1;
    padding: 20px;
    overflow-x: auto;
}

@media (max-width: 768px) {
    .main-container {
        flex-direction: column;
    }

    .sidebar {
        width: 100%;
        height: auto;
    }
}
```

## Performance Optimizations

1. **Memoization**: React's `useMemo` and `useCallback` hooks optimize rendering performance
2. **Virtualization**: For large lists, react-window/react-virtualized minimize DOM nodes
3. **Code Splitting**: React.lazy and Suspense reduce initial bundle size

```typescript
// src/App.tsx (with code splitting)
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/common/Header';
import Sidebar from './components/common/Sidebar';
import LoadingSpinner from './components/common/LoadingSpinner';

// Lazy-loaded components
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ContainerDetail = lazy(() => import('./pages/ContainerDetail'));
const Images = lazy(() => import('./pages/Images'));
const Settings = lazy(() => import('./pages/Settings'));

const App: React.FC = () => {
    return (
        <Router>
            <div className='app'>
                <Header />
                <div className='main-container'>
                    <Sidebar />
                    <main className='content'>
                        <Suspense fallback={<LoadingSpinner />}>
                            <Routes>
                                <Route path='/' element={<Dashboard />} />
                                <Route
                                    path='/containers/:id'
                                    element={<ContainerDetail />}
                                />
                                <Route path='/images' element={<Images />} />
                                <Route
                                    path='/settings'
                                    element={<Settings />}
                                />
                            </Routes>
                        </Suspense>
                    </main>
                </div>
            </div>
        </Router>
    );
};

export default App;
```

## Testing Strategy

The frontend uses Jest and React Testing Library for unit and integration tests:

```typescript
// src/components/container/ContainerRow.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ContainerRow from './ContainerRow';

const mockContainer = {
    id: 'abc123',
    name: 'test-container',
    image: 'nginx:latest',
    status: 'running',
    state: 'running',
    ports: '80/tcp->8080/tcp',
    created: '2023-04-15T10:30:45Z',
};

const mockOnAction = jest.fn();

describe('ContainerRow', () => {
    beforeEach(() => {
        mockOnAction.mockClear();
    });

    test('renders container information correctly', () => {
        render(
            <ContainerRow container={mockContainer} onAction={mockOnAction} />
        );

        expect(screen.getByText('test-container')).toBeInTheDocument();
        expect(screen.getByText('nginx:latest')).toBeInTheDocument();
        expect(screen.getByText('running')).toBeInTheDocument();
    });

    test('calls onAction when action button is clicked', () => {
        render(
            <ContainerRow container={mockContainer} onAction={mockOnAction} />
        );

        fireEvent.click(screen.getByText('Stop'));
        expect(mockOnAction).toHaveBeenCalledWith('stop', 'abc123');
    });
});
```

## Internationalization (i18n)

The application supports multiple languages using react-i18next:

```typescript
// src/i18n.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
    en: {
        translation: {
            'container.status.running': 'Running',
            'container.status.stopped': 'Stopped',
            'container.action.start': 'Start',
            'container.action.stop': 'Stop',
            'container.action.restart': 'Restart',
            'container.action.delete': 'Delete',
            // More translations...
        },
    },
    // Additional languages...
};

i18n.use(initReactI18next).init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
        escapeValue: false,
    },
});

export default i18n;
```

## Accessibility Considerations

The application follows WCAG guidelines with:

1. Semantic HTML elements
2. ARIA attributes where needed
3. Keyboard navigation support
4. Focus management
5. Color contrast compliance

## Build and Deployment

The frontend build process uses:

1. **Webpack**: For bundling and optimization
2. **Babel**: For transpiling modern JavaScript
3. **ESLint**: For code quality enforcement
4. **TypeScript**: For type checking

The production build creates optimized, minified bundles for deployment.

## Future Enhancements

1. **Dark Mode**: Implement theme switching with CSS variables
2. **Offline Mode**: Add service workers for offline capability
3. **Progressive Web App (PWA)**: Enable installation on mobile devices
4. **Advanced Filtering**: More sophisticated container/image search and filtering
5. **Customizable Dashboard**: User-configurable widget layout
6. **Historical Metrics**: Charts and visualizations for container performance over time
7. **User Authentication**: Role-based access control for multi-user environments
8. **Container Terminal**: In-browser terminal access to running containers
