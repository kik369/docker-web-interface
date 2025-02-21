import React, { useState, useEffect } from 'react';

interface SettingsProps {
    onSave: (settings: { refreshInterval: number, rateLimit: number }) => void;
    currentSettings: { refreshInterval: number, rateLimit: number };
}

export const Settings: React.FC<SettingsProps> = ({ onSave, currentSettings }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(Math.round(currentSettings.refreshInterval));
    const [rateLimit, setRateLimit] = useState(currentSettings.rateLimit);
    const [showSavedMessage, setShowSavedMessage] = useState(false);

    // Update local state when currentSettings change
    useEffect(() => {
        setRefreshInterval(Math.round(currentSettings.refreshInterval));
        setRateLimit(currentSettings.rateLimit);
    }, [currentSettings]);

    // Auto-save when values change
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            // Only save if values have actually changed
            if (refreshInterval !== currentSettings.refreshInterval ||
                rateLimit !== currentSettings.rateLimit) {
                onSave({
                    refreshInterval: Math.round(refreshInterval),
                    rateLimit
                });
                setShowSavedMessage(true);
                setTimeout(() => setShowSavedMessage(false), 2000);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [refreshInterval, rateLimit, onSave, currentSettings]);

    return (
        <div className="relative">
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
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(Math.max(5, Math.round(Number(e.target.value))))}
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
                            value={rateLimit}
                            onChange={(e) => setRateLimit(Math.max(1, Number(e.target.value)))}
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
