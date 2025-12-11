import express from 'express';
import pg from 'pg';
import cors from 'cors';

const { Pool } = pg;

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
    host: 'db.znfamffcymyvsihpnfpk.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: process.env.DB_PASS,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

async function initDatabase() {
    try {
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

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_runs_power ON runs(power DESC);
            CREATE INDEX IF NOT EXISTS idx_runs_heat ON runs(heat DESC);
            CREATE INDEX IF NOT EXISTS idx_runs_money ON runs(money DESC);
            CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs(timestamp DESC);
        `);
    } catch (error) {
        console.error('Error initializing database:', error);
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
    try {
        await initDatabase();
        app.listen(port, () => {
            console.log(`Leaderboard API server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

