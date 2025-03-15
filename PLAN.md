# Docker Web Interface - Project Plan

## ⚠️ CRITICAL IMPLEMENTATION GUIDELINES ⚠️

1. **NEVER RESTART ANY SERVICES**

    - **DO NOT** restart the frontend server
    - **DO NOT** restart the backend server
    - **DO NOT** restart Docker containers
    - **DO NOT** restart the Docker Compose stack
    - The system has hot-reload enabled in all components
    - Code changes will automatically be applied without any restarts

2. **IMPLEMENTATION CONFIRMATION REQUIRED**
    - **ALWAYS** ask the user to confirm if a feature has been successfully implemented
    - **NEVER** mark tasks as completed without explicit user confirmation
    - Only move items to "Recently Completed Work" after user verification
    - If the user indicates the implementation is not complete, keep the task in the To-Do list

## Overview

This document serves as the central coordination point for the Docker Web Interface project. It provides:

1. A registry of all documentation files
2. Guidelines for maintaining documentation
3. Current project status and to-do items
4. Recently completed work

This document should be consulted before making any changes to the codebase and updated after changes have been completed.

## Documentation Architecture

| File                                 | Purpose                                             | When to Consult                                    | When to Update                                   |
| ------------------------------------ | --------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| [README.md](README.md)               | User-facing project overview and setup instructions | Before changing user workflows or setup process    | After adding features or changing installation   |
| [DATA_FLOW.md](DATA_FLOW.md)         | Visual diagrams of system data flows                | Before modifying data paths between components     | After changing how data moves through the system |
| [WEBSOCKET.md](WEBSOCKET.md)         | WebSocket implementation details                    | Before changing real-time communication            | After modifying WebSocket architecture or events |
| [FRONTEND.md](FRONTEND.md)           | Frontend architecture documentation                 | Before changing React components or state          | After modifying frontend architecture            |
| [BACKEND.md](BACKEND.md)             | Backend architecture documentation                  | Before changing Flask routes or Docker integration | After modifying backend architecture             |
| [API_REFERENCE.md](API_REFERENCE.md) | API endpoint documentation                          | Before changing any API endpoints                  | After modifying API contracts                    |
| [TESTING.md](TESTING.md)             | Testing strategy and instructions                   | Before changing test architecture                  | After adding or modifying tests                  |

## Documentation Guidelines

### Before Making Changes

1. **Always consult relevant documentation first**

    - Check architecture diagrams to understand components
    - Review API contracts before changing endpoints
    - Understand WebSocket events before modifying real-time features

2. **Cross-reference related documentation**

    - Changes may affect multiple documentation files
    - Ensure you understand all affected components

3. **Review current to-do list**
    - Check if your changes align with planned work
    - Identify potential conflicts with ongoing work

### After Making Changes

1. **Update all affected documentation immediately**

    - Keep diagrams synchronized with code
    - Update API documentation when endpoints change
    - Revise workflow documentation when features change

2. **Update this plan document**

    - Move completed items to "Recently Completed Work"
    - Add new to-do items as they are identified
    - Update project status section

3. **Add a changelog entry**
    - Document significant changes
    - Note any breaking changes that affect other components

## Current Project Status

### Active Development Areas

1. **Real-time Container Metrics**

    - Adding resource usage statistics to container view
    - Creating time-series visualizations of metrics

2. **Authentication System**

    - Designing JWT-based authentication
    - Integrating with WebSocket connections

3. **Documentation Enhancement**

    - Creating comprehensive API documentation
    - Updating diagrams to reflect current architecture

4. **UI Consistency Improvements**
    - Standardizing icon styles across the interface
    - Ensuring visual consistency between components

### To-Do Items

#### High Priority

-   [ ] Implement real-time container metrics collection
-   [ ] Create container resource usage visualization components
-   [ ] Add detailed API documentation with examples
-   [ ] Implement container log search functionality
-   [ ] Add authentication to WebSocket connections

#### Medium Priority

-   [ ] Improve error handling for Docker connection failures
-   [ ] Create diagrams for container lifecycle management
-   [ ] Expand test coverage for frontend components
-   [ ] Optimize log streaming for high-volume containers

#### Low Priority

-   [ ] Add configuration UI for application settings
-   [ ] Implement persistent filtering and sorting preferences
-   [ ] Create exportable container reports
-   [ ] Add multi-node support for Docker Swarm

## Recently Completed Work

### Real-time Container Log Streaming Implementation (Pending User Confirmation)

-   [x] Enhanced container log streaming to provide real-time updates in the UI
-   [x] Added auto-scroll functionality with the ability to pause scrolling when manually scrolling up
-   [x] Implemented "Follow Logs" button to resume auto-scrolling when paused
-   [x] Optimized WebSocket buffering system for more responsive updates
-   [x] Improved backend log streaming efficiency by skipping duplicate historical logs
-   [x] Added connection status tracking to the WebSocket hook
-   [x] Ensured logs continue streaming as long as the log panel is open
-   [x] Fixed issue where logs were only showing as static snapshots

**Implementation Summary:**

The real-time container log streaming feature has been completely overhauled to ensure seamless log updates. The implementation includes:

**Frontend Changes:**

-   Enhanced the `useWebSocket` hook with detailed logging of log updates and improved error handling
-   Updated the `ContainerRow` component to properly maintain log streaming state
-   Added debugging logs to track log updates throughout the system
-   Implemented auto-reconnection for log streams after errors
-   Optimized the log buffer flushing mechanism for more responsive updates (reduced delay from 10ms to 5ms)

**Backend Changes:**

-   Improved the `stream_container_logs` method in `docker_service.py` to ensure proper streaming configuration
-   Enhanced error handling and logging in the log streaming pipeline
-   Added checks for existing streams to prevent duplicate streams
-   Improved timestamp extraction to avoid duplicate logs
-   Added detailed logging throughout the streaming process for better debugging

**Key Improvements:**

-   Auto-scroll functionality that follows new logs as they arrive
-   Ability to pause auto-scrolling when manually scrolling up
-   "Follow Logs" button that appears when auto-scrolling is paused
-   Optimized log buffering system to balance responsiveness with performance
-   Visual indicators showing when log streaming is active
-   Improved error recovery with automatic reconnection
-   Better handling of log updates to ensure they're displayed immediately
-   Fixed the core issue where logs were only showing as static snapshots

**Has this feature been successfully implemented and can it be moved to the "Recently Completed Work" section?**

**Note:** This implementation is awaiting user confirmation before being considered fully completed.

### Theme Toggle Switch Implementation (Completed 2023-08-02)

-   [x] Replaced icon-based theme toggle with an iPhone-style toggle switch
-   [x] Implemented smooth transition animations for the toggle state
-   [x] Used blue color for the active (dark mode) state
-   [x] Maintained the same positioning and interaction behavior
-   [x] Ensured consistent appearance in both light and dark modes
-   [x] Added focus styles for better accessibility
-   [x] Increased size to match keyboard shortcuts button dimensions
-   [x] Added sun/moon icons inside the toggle button for better visual indication
-   [x] Added shadow for improved depth perception
-   [x] Changed sun icon color to blue in dark mode for better color consistency
-   [x] Updated toggle background in dark mode to grey (rgb(31 41 55)) to match other UI elements

### UI Icon Consistency (Completed 2023-08-01)

-   [x] Analyzed the theme switcher icon style
-   [x] Updated the keyboard shortcuts icon to match theme switcher styling
-   [x] Changed the icon to a simple question mark without circular background
-   [x] Used blue color for the question mark icon
-   [x] Ensured consistent appearance in both light and dark modes
-   [x] Maintained the same positioning and interaction behavior

### Dark Mode Fixes (Completed 2023-07-31)

-   [x] Identified components not properly adapting to theme changes
-   [x] Updated ContainerList and ImageList components for proper light mode styling
-   [x] Fixed tooltip and log container styling in light mode
-   [x] Removed hard-coded dark background colors from CSS
-   [x] Ensured consistent appearance across both themes
-   [x] Verified no layout shifts when switching themes

### Dark Mode Implementation (Completed 2023-07-30)

-   [x] Configured Tailwind for dark mode support
-   [x] Created ThemeContext for theme state management
-   [x] Implemented theme toggle component in the header
-   [x] Added keyboard shortcut (Ctrl+D) for toggling themes
-   [x] Updated UI components to support both light and dark modes
-   [x] Added theme preference persistence using localStorage

### Documentation Enhancement (Completed 2023-07-25)

-   [x] Created comprehensive data flow diagrams using Mermaid
-   [x] Consolidated WebSocket documentation into a single file
-   [x] Improved README with documentation references
-   [x] Removed redundant documentation

### Logging Reduction (Completed 2023-07-15)

-   [x] Enhanced SocketErrorFilter to reduce noise
-   [x] Improved NoneType error handling
-   [x] Implemented log buffering for better performance
-   [x] Adjusted default log levels for production

## Container Log Streaming Issue Analysis

### Current Behavior

-   When a user clicks "Show Logs" for a container, the logs are fetched and displayed as a static snapshot
-   New logs generated by the container are not automatically displayed in the UI
-   To see new logs, the user must close the logs panel and reopen it
-   The WebSocket connection appears to be established correctly, but log updates are not being reflected in the UI
-   The "Log streaming active..." indicator is shown, suggesting the system believes streaming is working

### Expected Behavior

-   When a user clicks "Show Logs", initial logs should be fetched and displayed
-   As new logs are generated by the container, they should automatically appear in the UI in real-time
-   The log panel should auto-scroll to show the newest logs (unless the user has manually scrolled up)
-   The streaming should continue as long as the log panel is open

### Root Cause Analysis

1. **WebSocket Connection**: The WebSocket connection is established, but there may be issues with:

    - Event handling on the frontend
    - Message delivery from backend to frontend
    - Proper registration of event handlers

2. **Backend Streaming**: The backend appears to be set up to stream logs, but:

    - The Docker log streaming may not be working as expected
    - The backend may not be correctly forwarding log updates to the WebSocket
    - There might be timing or synchronization issues

3. **Frontend Rendering**: The frontend receives log updates but:
    - The React component may not be re-rendering when new logs arrive
    - The state updates might not be triggering UI updates
    - There could be issues with the log buffer implementation

### Troubleshooting Approach

1. **Verify WebSocket Communication**:

    - Add explicit debug logging for WebSocket events on both frontend and backend
    - Confirm that log update events are being sent from the backend
    - Verify that the frontend is receiving these events

2. **Test Docker Log Streaming**:

    - Validate that the Docker API is correctly streaming logs
    - Add logging to track the flow of log data from Docker to the WebSocket

3. **Inspect Frontend State Management**:

    - Ensure that log updates are correctly updating component state
    - Verify that state changes are triggering re-renders
    - Check that the log display component is not being memoized in a way that prevents updates

4. **Implement Direct Testing**:
    - Create a simple test that directly emits log updates to verify the frontend can receive and display them
    - Test the log streaming in isolation from the rest of the application

### Implementation Strategy

1. **Backend Improvements**:

    - Enhance logging to track the flow of log data
    - Ensure the Docker log streaming is properly configured
    - Verify that WebSocket events are being emitted correctly

2. **Frontend Enhancements**:

    - Improve the WebSocket hook to better handle log updates
    - Ensure the component state is updated correctly
    - Add more robust error handling and recovery

3. **Testing and Validation**:
    - Implement a systematic approach to verify each part of the log streaming pipeline
    - Test with different containers and log volumes
    - Validate that the UI updates in real-time as expected

This analysis will guide our approach to fixing the real-time log streaming functionality.

## Implementation Plans

### Implementation Workflow

#### Standard Implementation Process

1. **Planning Phase**

    - Consult PLAN.md and relevant documentation
    - Understand the feature requirements and constraints
    - Plan the implementation approach

2. **Implementation Phase**

    - Make necessary code changes
    - Follow all coding standards and conventions
    - **NEVER restart any services** - all changes should apply with hot-reload

3. **Documentation Phase**

    - Update relevant documentation files
    - Document any deviations from the original plan
    - Prepare implementation summary for user confirmation

4. **Confirmation Phase**

    - Present implementation summary to the user
    - Ask explicitly: "Has this feature been successfully implemented?"
    - Only mark as complete after receiving affirmative confirmation
    - Template for confirmation request:

    ```
    Implementation Summary:
    - [List key changes made]
    - [Describe how the feature works now]
    - [Note any limitations or future improvements]

    Has this feature been successfully implemented and can it be moved to the "Recently Completed Work" section?
    ```

### Dark Mode Support Implementation

#### Overview

This plan outlines the implementation of a dark/light mode toggle feature for the Docker Web Interface using Tailwind CSS best practices. The feature will allow users to switch between light and dark themes with their preference being persisted across sessions.

#### Implementation Phases

##### Phase 1: Tailwind Configuration (Estimated: 1 day)

-   [x] Configure Tailwind for dark mode support in `tailwind.config.js`:
    -   [x] Enable the `darkMode: 'class'` option to use class-based dark mode
    -   [x] Define color palette variables for both light and dark modes
    -   [x] Create custom utility classes if needed for specific UI elements

##### Phase 2: Theme Context Setup (Estimated: 1 day)

-   [x] Create a ThemeContext to manage theme state:
    -   [x] Implement a React context provider for theme state management
    -   [x] Create hooks for accessing and updating theme preferences
    -   [x] Add local storage integration to persist user preferences
    -   [x] Implement system preference detection using `prefers-color-scheme` media query

##### Phase 3: Toggle Component Development (Estimated: 1 day)

-   [x] Design and implement the theme toggle component:
    -   [x] Create a visually appealing toggle UI element
    -   [x] Position the toggle in the application header/navbar
    -   [x] Add appropriate icons for sun/moon to indicate modes
    -   [x] Implement smooth transition animations between states

##### Phase 4: Application-wide Theme Integration (Estimated: 2 days)

-   [x] Apply dark mode classes throughout the application:
    -   [x] Update base layouts and containers
    -   [x] Modify component styling to respect dark mode:
        -   [x] Container panels and cards
        -   [x] Container and image list items
        -   [x] Action buttons and controls
    -   [x] Ensure all text maintains proper contrast in both modes
    -   [x] Adapt charts, graphs, and visualizations for dark mode
    -   [x] Test and adjust notification and alert styling

##### Phase 5: Testing and Refinement (Estimated: 1 day)

-   [x] Comprehensive testing across the application:
    -   [x] Test on multiple browsers and screen sizes
    -   [x] Verify all components render correctly in both modes
    -   [x] Ensure preference persistence works as expected
    -   [x] Validate system preference detection functions properly
    -   [x] Check for any contrast issues or accessibility concerns

#### Technical Details

##### Tailwind Configuration Example

```javascript
// tailwind.config.js
module.exports = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Light mode colors
                'light-primary': '#3490dc',
                'light-secondary': '#ffed4a',
                'light-background': '#f8fafc',
                'light-surface': '#ffffff',
                'light-text': '#1a202c',

                // Dark mode colors
                'dark-primary': '#90cdf4',
                'dark-secondary': '#faf089',
                'dark-background': '#1a202c',
                'dark-surface': '#2d3748',
                'dark-text': '#f7fafc',
            },
        },
    },
    // ...
};
```

##### Theme Context Implementation Strategy

```jsx
// Simplified example of theme context
import React, { createContext, useState, useEffect, useContext } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Check for saved theme or system preference
    const getInitialTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) return savedTheme;

        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
    };

    const [theme, setTheme] = useState(getInitialTheme);

    // Update document root class and localStorage when theme changes
    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

// Custom hook for using the theme
export const useTheme = () => useContext(ThemeContext);
```

##### Theme Toggle Component Approach

```jsx
// Simplified toggle component example
import { useTheme } from '../contexts/ThemeContext';

const ThemeToggle = () => {
    const { theme, setTheme } = useTheme();

    const toggleTheme = () => {
        setTheme(theme === 'light' ? 'dark' : 'light');
    };

    return (
        <button
            onClick={toggleTheme}
            className='p-2 rounded-full bg-gray-200 dark:bg-gray-700 transition-colors duration-200'
            aria-label={`Switch to ${
                theme === 'light' ? 'dark' : 'light'
            } mode`}
        >
            {theme === 'light' ? (
                <MoonIcon className='h-5 w-5 text-gray-800' />
            ) : (
                <SunIcon className='h-5 w-5 text-yellow-300' />
            )}
        </button>
    );
};
```

#### Component Adaptation Guidelines

-   Use Tailwind's dark mode variant in class names: `className="bg-white dark:bg-gray-800 text-black dark:text-white"`
-   For custom components:
    -   Ensure all text has sufficient contrast in both modes
    -   Use color-neutral icons where possible, or provide alternative icons for dark mode
    -   Container elements should use appropriate background colors: `bg-white dark:bg-gray-800`
    -   Add subtle borders in dark mode where necessary for visual separation
-   **Important**: Only change colors and shadows when switching themes. Do not modify:
    -   Element sizes or dimensions
    -   Typography sizes or weights
    -   Layout spacing (padding, margin, etc.)
    -   Flexbox or grid layouts
    -   Component positioning

#### Observations and Considerations

-   Opt for a smooth transition between modes using CSS transitions
-   Consider adding a "system preference" option in addition to explicit light/dark choices
-   Charts and data visualizations need careful color selection to work in both modes
-   Test with users who use dark mode regularly to ensure comfortable experience
-   Some third-party components may need custom styling to integrate with dark mode
-   **NEVER restart containers or services**:
    -   Do not attempt to restart npm servers
    -   Do not restart Docker containers or Docker Compose applications
    -   The system has hot-reload enabled with watch functionality in Docker Compose
    -   Only implement code changes and update documentation
