import React, { useRef, useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

interface LogContainerProps {
    logs: string;
    isLoading: boolean;
    containerId: string;
    onClose: () => void;
    isStreamActive: boolean;
}

// Extract Log Container to its own memoized component
const LogContainer: React.FC<LogContainerProps> = React.memo(({
    logs,
    isLoading,
    containerId,
    onClose,
    isStreamActive
}) => {
    const logContainerRef = useRef<HTMLPreElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
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
    }, []);

    return (
        <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'} p-4 rounded-lg mt-2`}>
            <div className="flex justify-between items-center mb-2">
                <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Container Logs</h3>
                <div className="flex items-center">
                    {isStreamActive && (
                        <div className="flex items-center mr-3 text-xs text-green-500">
                            <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                            Log streaming active
                        </div>
                    )}
                    {!autoScroll && (
                        <button
                            onClick={() => setAutoScroll(true)}
                            className={`text-xs ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded px-2 py-1 mr-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'} flex items-center`}
                            title="Scroll to bottom and follow new logs"
                        >
                            <span className="inline-block w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                            Follow Logs
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className={`text-xs ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Close
                    </button>
                </div>
            </div>
            {isLoading ? (
                <div className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Loading logs...</div>
            ) : (
                <pre
                    ref={logContainerRef}
                    onScroll={handleScroll}
                    className={`${theme === 'dark' ? 'bg-black text-gray-300' : 'bg-gray-200 text-gray-800'} p-3 rounded text-xs font-mono overflow-auto max-h-96 relative`}
                >
                    {logs || 'No logs available'}
                </pre>
            )}
        </div>
    );
});

export default LogContainer;
