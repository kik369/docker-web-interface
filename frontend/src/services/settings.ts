import { config } from '../config';

interface Settings {
    refreshInterval: number;  // in seconds
    rateLimit: number;
}

export const getSettings = async (): Promise<Settings> => {
    try {
        const response = await fetch(`${config.API_URL}/api/settings`);
        if (!response.ok) {
            throw new Error('Failed to fetch settings');
        }
        const data = await response.json();
        if (data.status !== 'success' || !data.data) {
            throw new Error('Invalid response format');
        }
        return {
            refreshInterval: Math.max(5, Math.round(data.data.refreshInterval / 1000)), // Convert from ms to seconds
            rateLimit: Math.max(1, data.data.rateLimit)
        };
    } catch (error) {
        console.error('Error fetching settings:', error);
        throw error;
    }
};

export const updateRateLimit = async (rateLimit: number): Promise<void> => {
    try {
        const response = await fetch(`${config.API_URL}/api/settings/rate-limit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ rateLimit: Math.max(1, rateLimit) }),
        });

        if (!response.ok) {
            throw new Error('Failed to update rate limit');
        }
    } catch (error) {
        console.error('Error updating rate limit:', error);
        throw error;
    }
};

export const updateRefreshInterval = async (refreshInterval: number): Promise<void> => {
    try {
        const response = await fetch(`${config.API_URL}/api/settings/refresh-interval`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshInterval: Math.max(5, Math.round(refreshInterval)) }),
        });

        if (!response.ok) {
            throw new Error('Failed to update refresh interval');
        }
    } catch (error) {
        console.error('Error updating refresh interval:', error);
        throw error;
    }
};
