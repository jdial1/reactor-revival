export class LeaderboardService {
    constructor() {
        this.db = null;
        this.sqlite3 = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        try {
            if (!window.sqlite3InitModule) {
                await this.loadScript('lib/sqlite3.js');
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            if (window.sqlite3InitModule && typeof window.sqlite3InitModule.locateFile === 'undefined') {
                window.sqlite3InitModule.locateFile = (file) => {
                    if (typeof file === 'string' && file.endsWith('.wasm')) {
                        return './lib/sqlite3.wasm';
                    }
                    return file;
                };
            }
            
            this.sqlite3 = await window.sqlite3InitModule({
                print: () => {},
                printErr: (msg) => {
                    if (msg && typeof msg === 'string' && msg.includes('OPFS')) {
                        return;
                    }
                    console.error(msg);
                }
            });

            if (this.sqlite3 && 'oo1' in this.sqlite3) {
                if ('opfs' in this.sqlite3) {
                    this.db = new this.sqlite3.oo1.OpfsDb('/reactor_leaderboard.sqlite3');
                } else {
                    this.db = new this.sqlite3.oo1.DB('/reactor_leaderboard.sqlite3', 'ct');
                }

                this.createTables();
                this.initialized = true;
            }
        } catch (e) {
            console.error('Failed to init leaderboard service', e);
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    createTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE,
                run_id TEXT,
                timestamp INTEGER,
                heat REAL,
                power REAL,
                money REAL,
                time_played INTEGER
            );
        `);
        
        try { this.db.exec("ALTER TABLE runs ADD COLUMN run_id TEXT;"); } catch(e) {}
        try { this.db.exec("ALTER TABLE runs ADD COLUMN user_id TEXT UNIQUE;"); } catch(e) {}
    }

    saveRun(stats) {
        if (!this.initialized || !this.db) return;
        try {
            this.db.exec({
                sql: `
                    INSERT INTO runs (user_id, run_id, timestamp, heat, power, money, time_played) 
                    VALUES ($user_id, $run_id, $timestamp, $heat, $power, $money, $time_played)
                    ON CONFLICT(user_id) DO UPDATE SET
                        run_id = $run_id,
                        timestamp = $timestamp,
                        heat = CASE WHEN $heat > heat THEN $heat ELSE heat END,
                        power = CASE WHEN $power > power THEN $power ELSE power END,
                        money = CASE WHEN $money > money THEN $money ELSE money END,
                        time_played = CASE WHEN $time_played > time_played THEN $time_played ELSE time_played END
                `,
                bind: {
                    $user_id: stats.user_id,
                    $run_id: stats.run_id,
                    $timestamp: Date.now(),
                    $heat: stats.heat,
                    $power: stats.power,
                    $money: stats.money,
                    $time_played: stats.time
                }
            });
        } catch (e) {
            console.error("Error saving run to leaderboard", e);
        }
    }

    getTopRuns(sortBy = 'power', limit = 10) {
        if (!this.initialized || !this.db) return [];
        const validSorts = ['heat', 'power', 'money', 'timestamp'];
        if (!validSorts.includes(sortBy)) sortBy = 'power';
        
        const sortColumn = sortBy;
        const result = [];
        try {
            this.db.exec({
                sql: `SELECT * FROM runs ORDER BY ${sortColumn} DESC LIMIT ?`,
                bind: [limit],
                rowMode: 'object',
                callback: (row) => result.push(row)
            });
        } catch (e) {
            console.error("Error getting top runs", e);
            return [];
        }
        return result;
    }
}

export const leaderboardService = new LeaderboardService();

