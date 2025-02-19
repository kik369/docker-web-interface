interface Config {
    API_URL: string;
    REFRESH_INTERVAL: number;
    LOG_LEVEL: string;
    SEND_LOGS_TO_BACKEND: boolean;
}

declare global {
    interface Window {
        requestId?: string;
    }
}

export const config: Config = {
    API_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
    REFRESH_INTERVAL: parseInt(process.env.REACT_APP_REFRESH_INTERVAL || '30', 10) * 1000,
    LOG_LEVEL: process.env.REACT_APP_LOG_LEVEL || 'info',
    SEND_LOGS_TO_BACKEND: process.env.REACT_APP_SEND_LOGS_TO_BACKEND === 'true'
};
