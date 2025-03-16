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
}

// Extract Log Container to its own memoized component
const LogContainer: React.FC<LogContainerProps> = React.memo(({
    logs,
    isLoading,
    containerId,
    containerName,
    onClose,
    isStreamActive
}) => {
    const logContainerRef = useRef<HTMLPreElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const prevLogsLengthRef = useRef<number>(0);
    const { theme } = useTheme();

    // Detect when logs change to update tracking
    useEffect(() => {
        if (logs && logs.length !== prevLogsLengthRef.current) {
            prevLogsLengthRef.current = logs.length;
        }
    }, [logs]);

    // Scroll to bottom when logs update, but only if autoScroll is enabled
    useEffect(() => {
        if (logContainerRef.current && logs && autoScroll) {
            const scrollContainer = logContainerRef.current;
            // Use requestAnimationFrame to ensure the scroll happens after the DOM update
            requestAnimationFrame(() => {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            });
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
                    {/* Follow button first (conditionally rendered) */}
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

                    {/* Live indicator in the middle (conditionally rendered) */}
                    {isStreamActive && (
                        <span className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                            <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                            Live
                        </span>
                    )}

                    {/* Full Screen button */}
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

                    {/* Close button always last */}
                    <button
                        onClick={onClose}
                        className={buttonClasses}
                        title="Close logs"
                    >
                        <HiX className="w-4 h-4" />
                    </button>
                </div>
            </div>
            {isLoading ? (
                <div className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'} ${isFullScreen ? 'p-4' : ''}`}>Loading logs...</div>
            ) : (
                <pre
                    ref={logContainerRef}
                    onScroll={handleScroll}
                    className={preClasses}
                    style={{ padding: isFullScreen ? '16px' : undefined }}
                >
                    {logs || 'No logs available'}
                </pre>
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
