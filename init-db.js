const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const createTablesQuery = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    balance DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ads (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    ad_url TEXT NOT NULL,
    reward_amount DECIMAL(10, 4) NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 30,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ad_views (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    ad_id INT REFERENCES ads(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reward_claimed DECIMAL(10, 4) NOT NULL
);
`;

async function initDB() {
  try {
    await pool.query(createTablesQuery);
    console.log('Tables créées avec succès !');
  } catch (err) {
    console.error('Erreur lors de la création des tables :', err);
  } finally {
    await pool.end();
  }
}

initDB();
