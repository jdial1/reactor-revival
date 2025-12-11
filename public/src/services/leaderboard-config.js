function getApiUrl() {
    try {
        if (typeof window !== 'undefined' && window.location && window.location.hostname) {
            const hostname = window.location.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return 'http://localhost:3000';
            }
        }
    } catch (e) {
    }
    return 'https://reactor-revival.onrender.com';
}

export const LEADERBOARD_CONFIG = {
    get API_URL() {
        return getApiUrl();
    }
};

