# Frontend Architecture

## Overview

This document details the frontend architecture of the Docker Web Interface application, a React-based UI for Docker container and image management. The frontend is built with modern TypeScript, React hooks, and WebSocket communication for real-time updates.

## Directory Structure

```
frontend/
├── src/
│   ├── components/        # UI components
│   ├── hooks/             # Custom React hooks
│   ├── context/           # React Context providers
│   ├── services/          # Service modules
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   ├── App.tsx            # Main application component
│   ├── index.tsx          # Application entry point
│   └── config.ts          # Configuration constants
├── public/                # Static assets
└── package.json           # Dependencies and scripts
```

## Key Components

### Component Architecture

1. **Container-Related Components**:

    - `ContainerList`: Main container listing and management UI
    - `ContainerRow`: Individual container information and actions
    - `ContainerGroup`: Groups containers by Docker Compose project

2. **Image-Related Components**:

    - `ImageList`: Main image listing and management UI
    - `ImageRow`: Individual image information and actions

3. **UI Components**:

    - `SearchBox`: Filtered search implementation
    - `TabNavigation`: Tab-based interface switching
    - `PortDisplay`: Specialized port mapping visualization
    - `ActionButton`: Standardized action buttons
    - `ConfirmationDialog`: Action confirmation modal
    - `CommandPalette`: Global search interface triggered by Ctrl+K
    - `ThemeToggle`: Dark/light mode toggle switch

4. **Log Visualization**:
    - `LogContainer`: Real-time container log display with auto-scroll

## State Management

### React Hooks

Custom hooks encapsulate specific functionality:

```typescript
// Container management
const {
    containers,
    isLoading,
    error,
    startContainer,
    stopContainer,
    restartContainer,
    deleteContainer,
} = useContainers();

// WebSocket communication
const { startLogStream, stopLogStream } = useWebSocket({
    onLogUpdate,
    onContainerStateChange,
    onInitialState,
});

// Image management
const { images, isLoading, error, deleteImage } = useImages();

// Theme management
const { theme, toggleTheme } = useTheme();
```

### State Persistence

LocalStorage used to persist UI state between sessions:

```typescript
// Tab selection persistence
const [activeTab, setActiveTab] = useState<string>(
    () => localStorage.getItem('activeTab') || 'containers'
);

useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
}, [activeTab]);

// Group expansion state persistence
const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem('expandedGroups') || '[]'))
);

useEffect(() => {
    localStorage.setItem('expandedGroups', JSON.stringify([...expandedGroups]));
}, [expandedGroups]);

// Theme preference persistence
const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
});

useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
}, [theme]);
```

## API Communication

### REST API Consumption

API interactions using fetch API with error handling:

```typescript
const response = await fetch(`${config.API_URL}/api/containers`);
const result = await response.json();

if (!response.ok) {
    throw new Error(result.error || 'Failed to fetch containers');
}

if (result.status === 'error') {
    throw new Error(result.error || 'Failed to fetch containers');
}

return result.data;
```

### WebSocket Integration

Real-time updates via Socket.IO client:

```typescript
// Singleton WebSocket connection
let globalSocket: Socket | null = null;

globalSocket = io(config.API_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 60000,
});

// Event handling
globalSocket.on('container_state_change', (data: ContainerState) => {
    // Update UI with new container state
});
```

## TypeScript Type System

Strong typing throughout the application:

```typescript
export interface Container {
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    created: string;
    ports: string;
    compose_project: string | null;
    compose_service: string | null;
}

export interface Image {
    id: string;
    tags: string[];
    size: number;
    created: string;
    repo_digests: string[];
    parent_id: string;
    labels: Record<string, string>;
}
```

## Styling

Tailwind CSS for styling components:

```tsx
<div className='bg-gray-900 p-4 rounded-lg mt-2'>
    <div className='flex justify-between items-center mb-2'>
        <h3 className='text-lg font-semibold text-white'>Container Logs</h3>
        <div className='flex items-center'>
            <span className='text-xs text-gray-400 mr-3'>
                Last update: {formattedTime}
            </span>
            <button
                onClick={onClose}
                className='text-xs text-gray-400 hover:text-white'
            >
                Close
            </button>
        </div>
    </div>
    {/* Component content */}
</div>
```

## Performance Optimizations

1. **Memo/Callback Usage**:

    ```typescript
    const LogContainer = React.memo(
        ({ logs, isLoading, containerId, onClose }) => {
            // Component implementation
        }
    );
    ```

2. **Virtualized Lists**:

    - Components implement virtualization for large data sets

3. **Throttling/Debouncing**:

    - Search functionality debounced to prevent excessive filtering
    - Log updates buffered to reduce render frequency

4. **Conditional Rendering**:
    ```typescript
    {
        isLoading ? (
            <Loading />
        ) : error ? (
            <ErrorMessage error={error} />
        ) : (
            <DataDisplay data={data} />
        );
    }
    ```

## User Experience Features

1. **Command Palette**:

    - Central interface for commands and search (activated with `Ctrl + K`)
    - Categorized commands with keyboard navigation
    - Container and image search functionality
    - Shortcut hints for frequently used commands
    - Keyboard navigation with arrow keys and Enter

2. **Keyboard Shortcuts**:

    - `Ctrl + K`: Open command palette
    - `Ctrl + Shift + C`: Switch to Containers tab
    - `Ctrl + Shift + I`: Switch to Images tab
    - `Ctrl + D`: Toggle dark/light mode
    - `Ctrl + R`: Refresh current view

3. **Search Functionality**:

    - Integrated into command palette
    - Real-time filtering of containers and images
    - Filters across multiple fields (name, ID, status)
    - Direct navigation to search results

4. **Grouping Mechanism**:

    - Containers grouped by Docker Compose project
    - Expandable/collapsible groups

5. **Theme Support**:
    - Dark and light mode with smooth transitions
    - System preference detection using `prefers-color-scheme` media query
    - User preference persistence using localStorage
    - Keyboard shortcut for quick theme toggling

## Error Handling

1. **API Errors**:

    ```typescript
    try {
        const data = await fetchResource();
        setData(data);
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        logger.error('Failed to fetch resource', err);
    } finally {
        setIsLoading(false);
    }
    ```

2. **Fallback UI**:

    ```typescript
    <ErrorBoundary fallback={<ErrorDisplay />}>
        <Component />
    </ErrorBoundary>
    ```

3. **Network Error Recovery**:
    - Automatic reconnection for WebSockets
    - Retry logic for failed API calls

## Testing Considerations

1. **Component Testing**:

    - Component functions should be pure when possible
    - Hooks separated from rendering logic for testability

2. **Mock Data Structures**:

    - Type-compatible mock objects for testing

3. **State Testing**:
    - Components should handle all state transitions gracefully

## Browser Compatibility

-   Modern browsers (Chrome, Firefox, Safari, Edge)
-   Responsive design for different screen sizes
-   No IE11 support

## Future Enhancements

1. **State Management Library**:

    - Consider Redux/MobX for more complex state requirements

2. **Code Splitting**:

    - Implement dynamic imports for better initial load time

3. **Accessibility Improvements**:

    - ARIA attributes for all components
    - Keyboard navigation enhancement

4. **Offline Support**:
    - Service Worker implementation for offline capabilities
