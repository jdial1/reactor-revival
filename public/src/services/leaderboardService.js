import { isTestEnv } from '../utils/util.js';
import { logger } from '../utils/logger.js';

function getLeaderboardApiUrl() {
    try {
        if (typeof window !== 'undefined' && window.location && window.location.hostname) {
            const hostname = window.location.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:3000';
        }
    } catch (e) {}
    return 'https://reactor-revival.onrender.com';
}

export const LEADERBOARD_CONFIG = { get API_URL() { return getLeaderboardApiUrl(); } };

export class LeaderboardService {
    constructor() {
        this.initialized = false;
        this.initPromise = null;
        this.apiBaseUrl = LEADERBOARD_CONFIG.API_URL;
        this.lastSaveTime = 0;
        this.saveCooldownMs = 60000;
        this.pendingSave = null;
        this.disabled = isTestEnv();
    }

    async _performSaveRun(stats) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/leaderboard/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: stats.user_id,
                    run_id: stats.run_id,
                    heat: stats.heat,
                    power: stats.power,
                    money: stats.money,
                    time: stats.time,
                    layout: stats.layout || null
                })
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                logger.log('error', 'game', 'Error saving run to leaderboard:', errorData.error || response.statusText);
            } else {
                this.lastSaveTime = Date.now();
            }
        } catch (e) {
            logger.log('error', 'game', 'Error saving run to leaderboard', e);
        } finally {
            this.pendingSave = null;
        }
    }

    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;
        if (this.disabled) {
            this.initialized = true;
            return;
        }

        this.initPromise = (async () => {
            try {
                const response = await fetch(`${this.apiBaseUrl}/health`);
                if (response.ok) {
                    this.initialized = true;
                } else {
                    logger.log('warn', 'game', 'Leaderboard API health check failed');
                }
            } catch (e) {
                const errorMsg = e.message || String(e);
                logger.log('warn', 'game', 'Leaderboard service unavailable:', errorMsg);
            } finally {
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    }

    async saveRun(stats) {
        if (this.disabled) return;
        if (!this.initialized) {
            await this.init();
        }

        const now = Date.now();
        const timeSinceLastSave = now - this.lastSaveTime;
        
        if (timeSinceLastSave < this.saveCooldownMs) {
            return;
        }

        if (this.pendingSave) {
            return;
        }

        this.pendingSave = this._performSaveRun(stats);

        return this.pendingSave;
    }

    async getTopRuns(sortBy = 'power', limit = 10) {
        if (this.disabled) return [];
        if (!this.initialized) {
            await this.init();
        }

        const validSorts = ['heat', 'power', 'money', 'timestamp'];
        if (!validSorts.includes(sortBy)) sortBy = 'power';

        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/leaderboard/top?sortBy=${sortBy}&limit=${limit}`
            );

            if (!response.ok) {
                logger.log('error', 'game', 'Error getting top runs:', response.statusText);
                return [];
            }

            const data = await response.json();
            return data.success ? data.data : [];
        } catch (e) {
            logger.log('error', 'game', 'Error getting top runs', e);
            return [];
        }
    }
}

export const leaderboardService = new LeaderboardService();
