import React, { useRef, useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

// Add import for X icon and Play icon
import { HiX } from 'react-icons/hi';

interface LogContainerProps {
    logs: string;
    isLoading: boolean;
    containerId: string;
    onClose: () => void;
    isStreamActive: boolean;
}

// Custom Lightning Bolt icon component
const LightningBoltIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
    >
        <path d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
);

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
    }, [autoScroll]);

    return (
        <div className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100'} p-4 rounded-lg mt-2`}>
            <div className="flex justify-between items-center mb-2">
                <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Container Logs</h3>
                <div className="flex items-center space-x-2">
                    {/* Follow button first (conditionally rendered) */}
                    {!autoScroll && (
                        <button
                            onClick={() => setAutoScroll(true)}
                            className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                            title="Scroll to bottom and follow new logs"
                        >
                            <LightningBoltIcon className="w-3.5 h-3.5 mr-1.5 text-yellow-300/70" />
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

                    {/* Close button always last */}
                    <button
                        onClick={onClose}
                        className={`inline-flex items-center ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded px-2 py-1 text-xs ${theme === 'dark' ? 'text-white' : 'text-gray-800'} transition-colors`}
                        title="Close logs"
                    >
                        <HiX className="w-4 h-4" />
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
