const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        balance NUMERIC(10, 4) DEFAULT 0.0000,
        is_admin BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ads (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        ad_url TEXT NOT NULL,
        reward_amount NUMERIC(10, 4) NOT NULL,
        duration_seconds INT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ad_views (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        ad_id INT REFERENCES ads(id),
        reward_claimed NUMERIC(10, 4) DEFAULT 0.0000,
        viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        amount NUMERIC(10, 4) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        account_details VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_promos (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        code VARCHAR(50) NOT NULL,
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Base de données initialisée avec succès !");
  } catch (err) {
    console.error("Erreur lors de l'initialisation de la DB :", err);
  } finally {
    await pool.end();
  }
}

initDB();
