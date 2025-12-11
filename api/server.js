import express from 'express';
import pg from 'pg';
import cors from 'cors';

const { Pool } = pg;

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
    ssl: {
        rejectUnauthorized: false
    }
};

console.log(`[${new Date().toISOString()}] Initializing database connection...`);
console.log(`[${new Date().toISOString()}] Database host: ${dbConfig.host}:${dbConfig.port}`);
console.log(`[${new Date().toISOString()}] Database name: ${dbConfig.database}`);
console.log(`[${new Date().toISOString()}] Database user: ${dbConfig.user}`);
console.log(`[${new Date().toISOString()}] DB_PASS environment variable: ${process.env.DB_PASS ? 'SET' : 'NOT SET'}`);

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Unexpected error on idle client:`, err);
    process.exit(-1);
});

pool.on('connect', () => {
    console.log(`[${new Date().toISOString()}] Database client connected`);
});

pool.on('acquire', () => {
    console.log(`[${new Date().toISOString()}] Database client acquired from pool`);
});

async function initDatabase() {
    console.log(`[${new Date().toISOString()}] Starting database initialization...`);
    
    try {
        console.log(`[${new Date().toISOString()}] Testing database connection...`);
        await pool.query('SELECT NOW()');
        console.log(`[${new Date().toISOString()}] Database connection successful`);
        
        console.log(`[${new Date().toISOString()}] Creating runs table if not exists...`);
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
        console.log(`[${new Date().toISOString()}] Runs table ready`);

        console.log(`[${new Date().toISOString()}] Creating indexes...`);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_runs_power ON runs(power DESC);
            CREATE INDEX IF NOT EXISTS idx_runs_heat ON runs(heat DESC);
            CREATE INDEX IF NOT EXISTS idx_runs_money ON runs(money DESC);
            CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs(timestamp DESC);
        `);
        console.log(`[${new Date().toISOString()}] Indexes ready`);
        
        console.log(`[${new Date().toISOString()}] Database initialization completed successfully`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error initializing database:`);
        console.error(`[${new Date().toISOString()}] Error code: ${error.code}`);
        console.error(`[${new Date().toISOString()}] Error message: ${error.message}`);
        console.error(`[${new Date().toISOString()}] Error syscall: ${error.syscall || 'N/A'}`);
        console.error(`[${new Date().toISOString()}] Error address: ${error.address || 'N/A'}`);
        console.error(`[${new Date().toISOString()}] Error port: ${error.port || 'N/A'}`);
        console.error(`[${new Date().toISOString()}] Full error:`, error);
        throw error;
    }
}

app.post('/api/leaderboard/save', async (req, res) => {
    try {
        const { user_id, run_id, heat, power, money, time, layout } = req.body;

        if (!user_id || !run_id) {
            return res.status(400).json({ error: 'user_id and run_id are required' });
        }

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

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error saving run:', error);
        res.status(500).json({ error: 'Failed to save run', message: error.message });
    }
});

app.get('/api/leaderboard/top', async (req, res) => {
    try {
        const sortBy = req.query.sortBy || 'power';
        const limit = parseInt(req.query.limit || '10', 10);

        const validSorts = ['heat', 'power', 'money', 'timestamp'];
        const sortColumn = validSorts.includes(sortBy) ? sortBy : 'power';

        const result = await pool.query(`
            SELECT * FROM runs 
            ORDER BY ${sortColumn} DESC 
            LIMIT $1
        `, [limit]);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error getting top runs:', error);
        res.status(500).json({ error: 'Failed to get top runs', message: error.message });
    }
});

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected' });
    } catch (error) {
        res.status(500).json({ status: 'error', database: 'disconnected', error: error.message });
    }
});

async function startServer() {
    console.log(`[${new Date().toISOString()}] Starting server...`);
    console.log(`[${new Date().toISOString()}] Port: ${port}`);
    console.log(`[${new Date().toISOString()}] Node environment: ${process.env.NODE_ENV || 'not set'}`);
    
    try {
        await initDatabase();
        
        app.listen(port, () => {
            console.log(`[${new Date().toISOString()}] ========================================`);
            console.log(`[${new Date().toISOString()}] Leaderboard API server running on port ${port}`);
            console.log(`[${new Date().toISOString()}] Server ready to accept connections`);
            console.log(`[${new Date().toISOString()}] ========================================`);
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ========================================`);
        console.error(`[${new Date().toISOString()}] Failed to start server`);
        console.error(`[${new Date().toISOString()}] Error code: ${error.code || 'N/A'}`);
        console.error(`[${new Date().toISOString()}] Error message: ${error.message || 'N/A'}`);
        console.error(`[${new Date().toISOString()}] Full error:`, error);
        console.error(`[${new Date().toISOString()}] ========================================`);
        process.exit(1);
    }
}

startServer();

