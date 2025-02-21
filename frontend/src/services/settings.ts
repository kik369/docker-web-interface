import { config } from '../config';

interface Settings {
    refreshInterval: number;
    rateLimit: number;
}

export const getSettings = async (): Promise<Settings> => {
    try {
        const response = await fetch(`${config.API_URL}/api/settings`);
        if (!response.ok) {
            throw new Error('Failed to fetch settings');
        }
        const data = await response.json();
        return {
            refreshInterval: data.data.refreshInterval / 1000, // Convert to seconds
            rateLimit: data.data.rateLimit
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
            body: JSON.stringify({ rateLimit }),
        });

        if (!response.ok) {
            throw new Error('Failed to update rate limit');
        }
    } catch (error) {
        console.error('Error updating rate limit:', error);
        throw error;
    }
};
