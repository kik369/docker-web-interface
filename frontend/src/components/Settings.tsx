import React, { useState, useEffect, useRef } from 'react';

interface SettingsProps {
    refreshInterval: number;
    rateLimit: number;
    onRefreshIntervalChange: (refreshInterval: number) => Promise<void>;
    onRateLimitChange: (rateLimit: number) => Promise<void>;
}

export const Settings: React.FC<SettingsProps> = ({
    refreshInterval: initialRefreshInterval,
    rateLimit: initialRateLimit,
    onRefreshIntervalChange,
    onRateLimitChange
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [localRefreshInterval, setLocalRefreshInterval] = useState(Math.round(initialRefreshInterval));
    const [localRateLimit, setLocalRateLimit] = useState(initialRateLimit);
    const [showSavedMessage, setShowSavedMessage] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);

    // Update local state when props change
    useEffect(() => {
        setLocalRefreshInterval(Math.round(initialRefreshInterval));
        setLocalRateLimit(initialRateLimit);
    }, [initialRefreshInterval, initialRateLimit]);

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Auto-save when values change
    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            // Only save if values have actually changed
            if (localRefreshInterval !== initialRefreshInterval) {
                await onRefreshIntervalChange(Math.round(localRefreshInterval));
                setShowSavedMessage(true);
            }
            if (localRateLimit !== initialRateLimit) {
                await onRateLimitChange(localRateLimit);
                setShowSavedMessage(true);
            }
            if (showSavedMessage) {
                setTimeout(() => setShowSavedMessage(false), 2000);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [localRefreshInterval, localRateLimit, initialRefreshInterval, initialRateLimit, onRefreshIntervalChange, onRateLimitChange]);

    return (
        <div className="relative" ref={settingsRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
            >
                Settings
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-96 bg-gray-800 rounded-lg shadow-lg p-4 z-50">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white">App Settings</h2>
                        {showSavedMessage && (
                            <div className="flex items-center text-green-400">
                                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                <span>Settings saved</span>
                            </div>
                        )}
                    </div>

                    <div className="mb-4">
                        <label className="block text-white mb-2" htmlFor="refreshInterval">
                            Auto Refresh Interval (seconds)
                            <span className="block text-sm text-gray-400">How often the container list refreshes</span>
                        </label>
                        <input
                            type="number"
                            id="refreshInterval"
                            value={localRefreshInterval}
                            onChange={(e) => setLocalRefreshInterval(Math.max(5, Math.round(Number(e.target.value))))}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded"
                            min="5"
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-white mb-2" htmlFor="rateLimit">
                            API Rate Limit (requests per minute)
                            <span className="block text-sm text-gray-400">Maximum number of API requests per minute</span>
                        </label>
                        <input
                            type="number"
                            id="rateLimit"
                            value={localRateLimit}
                            onChange={(e) => setLocalRateLimit(Math.max(1, Number(e.target.value)))}
                            className="w-full bg-gray-700 text-white px-3 py-2 rounded"
                            min="1"
                        />
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
