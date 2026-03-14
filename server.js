/**
 * Mnemonist – Backend Server
 * Stack: Node.js + Express + PostgreSQL (pg)
 *
 * Setup:
 *   npm init -y
 *   npm install express pg
 *   DATABASE_URL=postgres://user:pass@host:5432/dbname node server.js
 *
 * Place mnemonist.html inside a folder called "public" alongside this file.
 */

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* ── PostgreSQL Connection ── */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // For local dev without SSL:
  // ssl: false
  // For Heroku / Render / cloud DBs:
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

/* ── Initialize Table ── */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mnemonist_scores (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      roll       TEXT NOT NULL,
      score      INTEGER NOT NULL,
      time_taken INTEGER,
      played_at  TIMESTAMP DEFAULT NOW()
    )
  `);
  // Add time_taken column if it doesn't exist (for existing tables)
  await pool.query(`
    ALTER TABLE mnemonist_scores ADD COLUMN IF NOT EXISTS time_taken INTEGER
  `);
  // Drop old CHECK constraint if it exists (was limiting score to 8)
  await pool.query(`
    ALTER TABLE mnemonist_scores DROP CONSTRAINT IF EXISTS mnemonist_scores_score_check
  `);
  console.log('✓ Database table ready.');
}

/* ── Middleware ── */
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ── POST /api/scores ── Save a new score */
app.post('/api/scores', async (req, res) => {
  const { name, roll, score, time_taken } = req.body;

  if (!name || !roll || score === undefined) {
    return res.status(400).json({ error: 'name, roll, and score are required.' });
  }
  if (typeof score !== 'number' || score < 0 || score > 10) {
    return res.status(400).json({ error: 'score must be a number between 0 and 10.' });
  }

  try {
    await pool.query(
      'INSERT INTO mnemonist_scores (name, roll, score, time_taken) VALUES ($1, $2, $3, $4)',
      [String(name).trim(), String(roll).trim(), score, time_taken ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('DB insert error:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

/* ── GET /api/leaderboard ── Top 10: score DESC, then time_taken ASC on tie */
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT name, roll, score, time_taken, played_at
      FROM mnemonist_scores
      ORDER BY score DESC, time_taken ASC NULLS LAST, played_at ASC
      LIMIT 10
    `);
    res.json(rows);
  } catch (err) {
    console.error('DB query error:', err);
    res.status(500).json({ error: 'Database error.' });
  }
});

/* ── Fallback: serve the game HTML ── */
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mnemonist.html'));
});

/* ── Start ── */
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✦ Mnemonist server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });