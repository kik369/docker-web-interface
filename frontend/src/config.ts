interface Config {
    API_URL: string;
    REFRESH_INTERVAL: number;
}

export const config: Config = {
    API_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
    REFRESH_INTERVAL: parseInt(process.env.REACT_APP_REFRESH_INTERVAL || '30', 10) * 1000,
};
