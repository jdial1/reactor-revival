import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dns from 'dns';
import { promisify } from 'util';

const { Pool } = pg;
const dnsLookup = promisify(dns.lookup);
const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const dbConfig = {
    host: 'db.znfamffcymyvsihpnfpk.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.DB_PASS,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
    ssl: {
        rejectUnauthorized: false
    }
};

function logTimestamp() {
    return `[${new Date().toISOString()}]`;
}

async function logDnsResolution(hostname) {
    try {
        console.log(`${logTimestamp()} Resolving DNS for ${hostname}...`);
        
        try {
            const ipv4 = await dnsResolve4(hostname);
            console.log(`${logTimestamp()} IPv4 addresses: ${ipv4.join(', ')}`);
        } catch (err) {
            console.log(`${logTimestamp()} No IPv4 addresses found: ${err.message}`);
        }
        
        try {
            const ipv6 = await dnsResolve6(hostname);
            console.log(`${logTimestamp()} IPv6 addresses: ${ipv6.join(', ')}`);
        } catch (err) {
            console.log(`${logTimestamp()} No IPv6 addresses found: ${err.message}`);
        }
        
        const lookup = await dnsLookup(hostname, { all: true });
        console.log(`${logTimestamp()} DNS lookup results:`);
        lookup.forEach((result, index) => {
            console.log(`${logTimestamp()}   ${index + 1}. Family: ${result.family === 4 ? 'IPv4' : 'IPv6'}, Address: ${result.address}`);
        });
    } catch (error) {
        console.error(`${logTimestamp()} DNS resolution error:`, error.message);
    }
}

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
    console.error(`${logTimestamp()} Unexpected error on idle client:`);
    console.error(`${logTimestamp()} Error code: ${err.code || 'N/A'}`);
    console.error(`${logTimestamp()} Error message: ${err.message || 'N/A'}`);
    console.error(`${logTimestamp()} Full error:`, err);
    process.exit(-1);
});

pool.on('connect', () => {
    console.log(`${logTimestamp()} Database client connected`);
    console.log(`${logTimestamp()} Pool stats - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
});

pool.on('acquire', () => {
    console.log(`${logTimestamp()} Database client acquired from pool`);
    console.log(`${logTimestamp()} Pool stats - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
});

pool.on('remove', () => {
    console.log(`${logTimestamp()} Database client removed from pool`);
    console.log(`${logTimestamp()} Pool stats - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
});

async function initDatabase() {
    const startTime = Date.now();
    console.log(`${logTimestamp()} Starting database initialization...`);
    console.log(`${logTimestamp()} Pool stats - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
    
    try {
        console.log(`${logTimestamp()} Attempting database connection...`);
        console.log(`${logTimestamp()} Connection timeout: ${dbConfig.connectionTimeoutMillis}ms`);
        
        const connectionStart = Date.now();
        const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
        const connectionTime = Date.now() - connectionStart;
        
        console.log(`${logTimestamp()} Database connection successful (${connectionTime}ms)`);
        console.log(`${logTimestamp()} PostgreSQL version: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}`);
        console.log(`${logTimestamp()} Server time: ${result.rows[0].current_time}`);
        console.log(`${logTimestamp()} Pool stats - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
        
        console.log(`${logTimestamp()} Creating runs table if not exists...`);
        const tableStart = Date.now();
        await pool.query(`
            CREATE TABLE IF NOT EXISTS runs (
                id SERIAL PRIMARY KEY,
                user_id TEXT,
                run_id TEXT UNIQUE,
                timestamp BIGINT,
                heat REAL,
                power REAL,
                money REAL,
                time_played INTEGER,
                layout TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        const tableTime = Date.now() - tableStart;
        console.log(`${logTimestamp()} Runs table ready (${tableTime}ms)`);

        console.log(`${logTimestamp()} Creating indexes...`);
        const indexStart = Date.now();
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_runs_power ON runs(power DESC);
            CREATE INDEX IF NOT EXISTS idx_runs_heat ON runs(heat DESC);
            CREATE INDEX IF NOT EXISTS idx_runs_money ON runs(money DESC);
            CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs(timestamp DESC);
        `);
        const indexTime = Date.now() - indexStart;
        console.log(`${logTimestamp()} Indexes ready (${indexTime}ms)`);
        
        const totalTime = Date.now() - startTime;
        console.log(`${logTimestamp()} Database initialization completed successfully (total: ${totalTime}ms)`);
        console.log(`${logTimestamp()} Pool stats - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`${logTimestamp()} ========================================`);
        console.error(`${logTimestamp()} Error initializing database (after ${totalTime}ms)`);
        console.error(`${logTimestamp()} Error code: ${error.code || 'N/A'}`);
        console.error(`${logTimestamp()} Error message: ${error.message || 'N/A'}`);
        console.error(`${logTimestamp()} Error syscall: ${error.syscall || 'N/A'}`);
        console.error(`${logTimestamp()} Error address: ${error.address || 'N/A'}`);
        console.error(`${logTimestamp()} Error port: ${error.port || 'N/A'}`);
        console.error(`${logTimestamp()} Error errno: ${error.errno || 'N/A'}`);
        
        if (error.code === 'ENETUNREACH') {
            console.error(`${logTimestamp()} Network unreachable - possible causes:`);
            console.error(`${logTimestamp()}   - IPv6 connectivity not available from this environment`);
            console.error(`${logTimestamp()}   - Firewall blocking connection`);
            console.error(`${logTimestamp()}   - Network routing issue`);
            console.error(`${logTimestamp()}   - DNS resolved to unreachable address`);
        }
        
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
            console.error(`${logTimestamp()} Connection timeout/refused - possible causes:`);
            console.error(`${logTimestamp()}   - Database server not accepting connections`);
            console.error(`${logTimestamp()}   - Firewall blocking port ${dbConfig.port}`);
            console.error(`${logTimestamp()}   - Connection timeout too short (current: ${dbConfig.connectionTimeoutMillis}ms)`);
        }
        
        console.error(`${logTimestamp()} Pool stats - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
        console.error(`${logTimestamp()} Full error stack:`, error);
        console.error(`${logTimestamp()} ========================================`);
        throw error;
    }
}

app.post('/api/leaderboard/save', async (req, res) => {
    const startTime = Date.now();
    try {
        const { user_id, run_id, heat, power, money, time, layout } = req.body;

        if (!user_id || !run_id) {
            console.log(`${logTimestamp()} POST /api/leaderboard/save - Bad request: missing user_id or run_id`);
            return res.status(400).json({ error: 'user_id and run_id are required' });
        }

        console.log(`${logTimestamp()} POST /api/leaderboard/save - Saving run for user: ${user_id}, run_id: ${run_id}`);
        const result = await pool.query(`
            INSERT INTO runs (user_id, run_id, timestamp, heat, power, money, time_played, layout)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT(run_id) DO UPDATE SET
                timestamp = $3,
                heat = CASE WHEN $4 > runs.heat THEN $4 ELSE runs.heat END,
                power = CASE WHEN $5 > runs.power THEN $5 ELSE runs.power END,
                money = CASE WHEN $6 > runs.money THEN $6 ELSE runs.money END,
                time_played = CASE WHEN $7 > runs.time_played THEN $7 ELSE runs.time_played END,
                layout = CASE WHEN $8 IS NOT NULL AND $5 > runs.power THEN $8 ELSE runs.layout END
            RETURNING *
        `, [user_id, run_id, Date.now(), heat || 0, power || 0, money || 0, time || 0, layout || null]);

        const duration = Date.now() - startTime;
        console.log(`${logTimestamp()} POST /api/leaderboard/save - Success (${duration}ms)`);
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`${logTimestamp()} POST /api/leaderboard/save - Error (${duration}ms):`, error.message);
        console.error(`${logTimestamp()} Error code: ${error.code || 'N/A'}`);
        res.status(500).json({ error: 'Failed to save run', message: error.message });
    }
});

app.get('/api/leaderboard/top', async (req, res) => {
    const startTime = Date.now();
    try {
        const sortBy = req.query.sortBy || 'power';
        const limit = parseInt(req.query.limit || '10', 10);

        const validSorts = ['heat', 'power', 'money', 'timestamp'];
        const sortColumn = validSorts.includes(sortBy) ? sortBy : 'power';

        console.log(`${logTimestamp()} GET /api/leaderboard/top - sortBy: ${sortColumn}, limit: ${limit}`);
        const result = await pool.query(`
            SELECT * FROM runs 
            ORDER BY ${sortColumn} DESC 
            LIMIT $1
        `, [limit]);

        const duration = Date.now() - startTime;
        console.log(`${logTimestamp()} GET /api/leaderboard/top - Success: ${result.rows.length} rows (${duration}ms)`);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`${logTimestamp()} GET /api/leaderboard/top - Error (${duration}ms):`, error.message);
        console.error(`${logTimestamp()} Error code: ${error.code || 'N/A'}`);
        res.status(500).json({ error: 'Failed to get top runs', message: error.message });
    }
});

app.get('/health', async (req, res) => {
    const startTime = Date.now();
    try {
        const healthCheck = await pool.query('SELECT 1 as health, NOW() as db_time');
        const duration = Date.now() - startTime;
        console.log(`${logTimestamp()} GET /health - Database healthy (${duration}ms)`);
        res.json({ 
            status: 'ok', 
            database: 'connected',
            responseTime: `${duration}ms`,
            poolStats: {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount
            },
            dbTime: healthCheck.rows[0].db_time
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`${logTimestamp()} GET /health - Database unhealthy (${duration}ms):`, error.message);
        res.status(500).json({ 
            status: 'error', 
            database: 'disconnected', 
            error: error.message,
            responseTime: `${duration}ms`,
            poolStats: {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount
            }
        });
    }
});

async function startServer() {
    const serverStartTime = Date.now();
    console.log(`${logTimestamp()} ========================================`);
    console.log(`${logTimestamp()} Starting server initialization...`);
    console.log(`${logTimestamp()} Node version: ${process.version}`);
    console.log(`${logTimestamp()} Platform: ${process.platform}`);
    console.log(`${logTimestamp()} Architecture: ${process.arch}`);
    console.log(`${logTimestamp()} Port: ${port}`);
    console.log(`${logTimestamp()} Node environment: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`${logTimestamp()} Working directory: ${process.cwd()}`);
    console.log(`${logTimestamp()} Process ID: ${process.pid}`);
    console.log(`${logTimestamp()} ========================================`);
    
    console.log(`${logTimestamp()} Initializing database connection...`);
    console.log(`${logTimestamp()} Database host: ${dbConfig.host}:${dbConfig.port}`);
    console.log(`${logTimestamp()} Database name: ${dbConfig.database}`);
    console.log(`${logTimestamp()} Database user: ${dbConfig.user}`);
    console.log(`${logTimestamp()} DB_PASS environment variable: ${process.env.DB_PASS ? 'SET' : 'NOT SET'}`);
    console.log(`${logTimestamp()} Connection timeout: ${dbConfig.connectionTimeoutMillis}ms`);
    console.log(`${logTimestamp()} Idle timeout: ${dbConfig.idleTimeoutMillis}ms`);
    console.log(`${logTimestamp()} Max pool connections: ${dbConfig.max}`);
    console.log(`${logTimestamp()} SSL enabled: true (rejectUnauthorized: false)`);
    
    await logDnsResolution(dbConfig.host);
    
    try {
        await initDatabase();
        
        console.log(`${logTimestamp()} Database initialization completed, starting HTTP server...`);
        
        app.listen(port, () => {
            const totalStartTime = Date.now() - serverStartTime;
            console.log(`${logTimestamp()} ========================================`);
            console.log(`${logTimestamp()} Leaderboard API server running on port ${port}`);
            console.log(`${logTimestamp()} Server ready to accept connections`);
            console.log(`${logTimestamp()} Total startup time: ${totalStartTime}ms`);
            console.log(`${logTimestamp()} Health check endpoint: http://localhost:${port}/health`);
            console.log(`${logTimestamp()} Pool stats - Total: ${pool.totalCount}, Idle: ${pool.idleCount}, Waiting: ${pool.waitingCount}`);
            console.log(`${logTimestamp()} ========================================`);
        });
        
        app.on('error', (error) => {
            console.error(`${logTimestamp()} HTTP server error:`, error);
        });
    } catch (error) {
        const totalStartTime = Date.now() - serverStartTime;
        console.error(`${logTimestamp()} ========================================`);
        console.error(`${logTimestamp()} Failed to start server (after ${totalStartTime}ms)`);
        console.error(`${logTimestamp()} Error code: ${error.code || 'N/A'}`);
        console.error(`${logTimestamp()} Error message: ${error.message || 'N/A'}`);
        console.error(`${logTimestamp()} Error syscall: ${error.syscall || 'N/A'}`);
        console.error(`${logTimestamp()} Error address: ${error.address || 'N/A'}`);
        console.error(`${logTimestamp()} Error port: ${error.port || 'N/A'}`);
        console.error(`${logTimestamp()} Full error stack:`, error);
        console.error(`${logTimestamp()} ========================================`);
        process.exit(1);
    }
}

startServer();

