import React, { useRef, useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import ReactDOM from 'react-dom';

// Add import for X icon, Document icon, and Expand/Minimize icons
import { HiX, HiOutlineDocumentText, HiOutlineArrowsExpand, HiOutlineViewGrid } from 'react-icons/hi';

interface LogContainerProps {
    logs: string;
    isLoading: boolean;
    containerId: string;
    containerName?: string;
    onClose: () => void;
    isStreamActive: boolean;
    isPaused: boolean;
    onPauseToggle: () => void;
}

// Extract Log Container to its own memoized component
const LogContainer: React.FC<LogContainerProps> = React.memo(({
    logs,
    isLoading,
    containerId,
    containerName,
    onClose,
    isStreamActive,
    isPaused,
    onPauseToggle
}) => {
    const logContainerRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [isFullScreen, setIsFullScreen] = useState(false);
    // const prevLogsLengthRef = useRef<number>(0); // Removed as it was unused
    const { theme } = useTheme();
    const [logLines, setLogLines] = useState<string[]>([]);
    const isAutoScrolling = useRef(false);

    // Process logs into lines for optimized rendering
    useEffect(() => {
        // Process logs even if empty string (logs !== null && logs !== undefined)
        if (logs !== null && logs !== undefined) {
            // Split logs into lines
            const lines = logs.split('\n');

            // Cap total lines to prevent memory issues (keep most recent 5,000 lines)
            const cappedLines = lines.length > 5000 ? lines.slice(lines.length - 5000) : lines;

            setLogLines(cappedLines);

            // Handle auto-scrolling
            if (autoScroll) {
                isAutoScrolling.current = true;
                // Use requestAnimationFrame to ensure scroll happens after render
                requestAnimationFrame(() => {
                    if (logContainerRef.current) {
                        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                        // Reset the flag after scrolling
                        setTimeout(() => {
                            isAutoScrolling.current = false;
                        }, 50);
                    }
                });
            }
        }
    }, [logs, autoScroll]);

    // Handle manual scroll to detect when user scrolls up (to disable auto-scroll)
    const handleScroll = () => {
        if (!logContainerRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
        const isScrolledToBottom = scrollHeight - scrollTop - clientHeight < 50; // Within 50px of bottom

        if (isScrolledToBottom !== autoScroll) {
            setAutoScroll(isScrolledToBottom);
            if (isScrolledToBottom) {
                // If user scrolled back to bottom, immediately scroll to the very bottom
                requestAnimationFrame(() => {
                    if (logContainerRef.current) {
                        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                    }
                });
            }
        }
    };

    // Toggle fullscreen mode
    const toggleFullScreen = () => {
        setIsFullScreen(!isFullScreen);
        // Ensure scroll position is maintained after resize
        if (logContainerRef.current) {
            requestAnimationFrame(() => {
                if (logContainerRef.current && autoScroll) {
                    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                }
            });
        }
    };

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Exit fullscreen mode when Escape key is pressed
            if (e.key === 'Escape' && isFullScreen) {
                setIsFullScreen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isFullScreen]);

    // Add body class to prevent scrolling when fullscreen is active
    useEffect(() => {
        if (isFullScreen) {
            document.body.classList.add('overflow-hidden');
        } else {
            document.body.classList.remove('overflow-hidden');
        }

        return () => {
            document.body.classList.remove('overflow-hidden');
        };
    }, [isFullScreen]);

    // Ensure the log container is visible and properly rendered
    useEffect(() => {
        // Scroll to bottom on initial render
        if (logContainerRef.current && autoScroll) {
            requestAnimationFrame(() => {
                if (logContainerRef.current) {
                    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
                }
            });
        }
    }, [autoScroll]);

    // Determine container classes based on fullscreen state
    const containerClasses = `${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'} transition-all duration-300 ${isFullScreen
        ? 'fixed inset-0 m-0 rounded-none overflow-hidden p-0'
        : 'p-4 rounded-lg mt-2'
        }`;

    // Determine log pre element classes based on fullscreen state
    const preClasses = `${theme === 'dark' ? 'bg-black text-gray-300' : 'bg-gray-200 text-gray-800'} rounded text-xs font-mono overflow-auto transition-all duration-300 ${isFullScreen ? 'h-[calc(100vh-60px)]' : 'max-h-96 p-3'
        } relative`;

    // Determine header classes based on fullscreen state
    const headerClasses = `flex justify-between items-center ${isFullScreen
        ? `sticky top-0 z-10 ${theme === 'dark' ? 'bg-gray-900 border-b border-gray-800' : 'bg-gray-100 border-b border-gray-300'} py-3 px-4`
        : 'mb-2'
        }`;

    // Determine button classes based on screen size
    const buttonClasses = `inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`;

    // Create the log container content
    const logContent = (
        <div
            id={`log-container-${containerId}`}
            className={containerClasses}
            style={{
                // When in fullscreen mode, ensure we're at the very top of the viewport
                top: isFullScreen ? '0' : undefined,
                left: isFullScreen ? '0' : undefined,
                right: isFullScreen ? '0' : undefined,
                bottom: isFullScreen ? '0' : undefined,
                // Add higher z-index to ensure it appears above everything
                zIndex: isFullScreen ? '9999' : undefined
            }}
        >
            <div className={headerClasses}>
                <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'} flex items-center`}>
                    {isFullScreen && (
                        <span className="inline-block w-3 h-3 bg-green-400 rounded-full mr-2"></span>
                    )}
                    <div className="flex items-center space-x-2">
                        <span>Container Logs</span>
                        {isFullScreen && containerName && (
                            <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} font-mono font-normal`}>
                                {containerName}
                            </span>
                        )}
                    </div>
                </h3>
                <div className="flex items-center space-x-2">
                    {/* Live indicator - always visible with different states (now first) */}
                    <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                        {!isStreamActive ? (
                            <>
                                <span className="inline-block w-2 h-2 bg-gray-500 rounded-full mr-2"></span>
                                <span className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Inactive</span>
                            </>
                        ) : isPaused ? (
                            <>
                                <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
                                <span className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Paused</span>
                            </>
                        ) : (
                            <>
                                <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                                Live
                            </>
                        )}
                    </span>

                    {/* Follow button (conditionally rendered, now second) */}
                    {!autoScroll && (
                        <button
                            onClick={() => setAutoScroll(true)}
                            className={buttonClasses}
                            title="Scroll to bottom and follow new logs"
                        >
                            <HiOutlineDocumentText className="w-4 h-4 mr-1.5 text-blue-300" />
                            Follow
                        </button>
                    )}

                    {/* Pause/Resume button (now third) */}
                    <button
                        onClick={onPauseToggle}
                        className={buttonClasses}
                        title={isPaused ? "Resume log streaming" : "Pause log streaming"}
                    >
                        {isPaused ? (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                </svg>
                                <span className="hidden sm:inline">Resume</span>
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <span className="hidden sm:inline">Pause</span>
                            </>
                        )}
                    </button>

                    {/* Full Screen button (now fourth) */}
                    <button
                        onClick={toggleFullScreen}
                        className={buttonClasses}
                        title={isFullScreen ? "Exit full screen" : "Full screen"}
                    >
                        {isFullScreen ? (
                            <>
                                <HiOutlineViewGrid className="w-4 h-4 mr-1.5" />
                                <span className="hidden sm:inline">Exit Full Screen</span>
                            </>
                        ) : (
                            <>
                                <HiOutlineArrowsExpand className="w-4 h-4 mr-1.5" />
                                <span className="hidden sm:inline">Full Screen</span>
                            </>
                        )}
                    </button>

                    {/* Close button with text label (now fifth) */}
                    <button
                        onClick={onClose}
                        className={buttonClasses}
                        title="Close logs"
                    >
                        <HiX className="w-4 h-4 mr-1.5" />
                        <span className="hidden sm:inline">Close</span>
                    </button>
                </div>
            </div>
            {isLoading ? (
                <div className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} ${isFullScreen ? 'p-4' : ''}`}>Loading logs...</div>
            ) : (
                <div
                    ref={logContainerRef}
                    onScroll={handleScroll}
                    className={preClasses}
                    style={{ padding: isFullScreen ? '16px' : undefined }}
                >
                    {logLines.length > 0 ? (
                        // Render logs with optimized approach - only show the last 5000 lines
                        logLines.map((line, index) => (
                            <div
                                key={`${containerId}-log-${index}`}
                                className="log-line"
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.75rem',
                                    lineHeight: '1.25rem',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all'
                                }}
                            >
                                {line}
                            </div>
                        ))
                    ) : (
                        <div className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} text-sm italic p-4`}>
                            {isStreamActive ? 'Waiting for logs...' : 'No logs available'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    // If in fullscreen mode, render using a portal to ensure it's at the top level of the DOM
    if (isFullScreen) {
        // Create a fullscreen overlay
        const overlayStyle = {
            position: 'fixed' as const,
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: theme === 'dark' ? '#111827' : '#f3f4f6',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column' as const,
            overflow: 'hidden'
        };

        return ReactDOM.createPortal(
            <div style={overlayStyle}>
                {logContent}
            </div>,
            document.body
        );
    }

    // Otherwise, render normally
    return logContent;
});

export default LogContainer;
