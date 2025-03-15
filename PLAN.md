# Docker Web Interface - Project Plan

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

## Implementation Plans

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
-   **Never restart containers or services**:
    -   Do not attempt to restart npm servers
    -   Do not restart Docker containers or Docker Compose applications
    -   The system has hot-reload enabled with watch functionality in Docker Compose
    -   Only implement code changes and update documentation
