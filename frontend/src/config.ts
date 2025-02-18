interface Config {
    API_URL: string;
    REFRESH_INTERVAL: number;
}

export const config: Config = {
    API_URL: window.ENV?.REACT_APP_API_URL || '',
    REFRESH_INTERVAL: parseInt(window.ENV?.REACT_APP_REFRESH_INTERVAL || '30', 10) * 1000,
};
