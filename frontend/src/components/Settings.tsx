import React, { useState } from 'react';

interface SettingsProps {
    onSave: (settings: { refreshInterval: number, rateLimit: number }) => void;
    currentSettings: { refreshInterval: number, rateLimit: number };
}

export const Settings: React.FC<SettingsProps> = ({ onSave, currentSettings }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(currentSettings.refreshInterval);
    const [rateLimit, setRateLimit] = useState(currentSettings.rateLimit);

    const handleSave = () => {
        onSave({ refreshInterval, rateLimit });
        setIsOpen(false);
    };

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
                    <h2 className="text-xl font-bold mb-4 text-white">App Settings</h2>

                    <div className="mb-4">
                        <label className="block text-white mb-2" htmlFor="refreshInterval">
                            Auto Refresh Interval (seconds)
                            <span className="block text-sm text-gray-400">How often the container list refreshes</span>
                        </label>
                        <input
                            type="number"
                            id="refreshInterval"
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(Math.max(5, Number(e.target.value)))}
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

                    <div className="flex justify-end space-x-2">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
