const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'cle_secrete_provisoire_hubhb';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// INITIALISATION AUTOMATIQUE DE LA BASE DE DONNÉES
async function initDatabase() {
  try {
    // 1. Table Utilisateurs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        balance NUMERIC DEFAULT 0
      );
    `);

    // 2. Table Publicités
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ads (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        reward_amount NUMERIC NOT NULL
      );
    `);

    // 3. Table Vues de Pubs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ad_views (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        ad_id INT REFERENCES ads(id),
        reward_claimed NUMERIC,
        viewed_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 4. Vérifier si les 50 pubs existent déjà, sinon les créer
    const adsCheck = await pool.query('SELECT COUNT(*) FROM ads');
    if (parseInt(adsCheck.rows[0].count) < 50) {
      await pool.query('DELETE FROM ad_views');
      await pool.query('DELETE FROM ads');
      
      for (let i = 1; i <= 50; i++) {
        await pool.query(
          'INSERT INTO ads (title, reward_amount) VALUES ($1, $2)',
          [`Publicité Sponsorisée #${i}`, 25.00]
        );
      }
      console.log('50 publicités créées avec succès !');
    }
  } catch (err) {
    console.error("Erreur lors de l'initialisation DB :", err);
  }
}

initDatabase();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Accès non autorisé.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide.' });
    req.user = user;
    next();
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// INSCRIPTION
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Veuillez remplir tous les champs.' });
  }

  try {
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      'INSERT INTO users (username, email, password_hash, balance) VALUES ($1, $2, $3, $4) RETURNING id, username, balance',
      [cleanUsername, cleanEmail, hashedPassword, 0]
    );
    res.json({ message: 'Compte créé avec succès !', user: newUser.rows[0] });
  } catch (err) {
    console.error("Erreur inscription :", err);
    if (err.code === "23505") {
      return res.status(400).json({ error: "Email ou nom d'utilisateur déjà utilisé." });
    }
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// CONNEXION
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Veuillez remplir l'email et le mot de passe." });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();

    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Connexion réussie !',
      token,
      user: { id: user.id, username: user.username, balance: user.balance }
    });
  } catch (err) {
    console.error("Erreur connexion :", err);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// LISTE DES PUBS (Limite 50 par jour)
app.get('/api/ads', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const adsQuery = `
      SELECT a.*, 
        CASE WHEN COUNT(v.id) > 0 THEN true ELSE false END AS watched
      FROM ads a
      LEFT JOIN ad_views v 
        ON a.id = v.ad_id 
        AND v.user_id = $1 
        AND v.viewed_at > NOW() - INTERVAL '24 hours'
      GROUP BY a.id
      ORDER BY a.id ASC
    `;
    const ads = await pool.query(adsQuery, [userId]);
    res.json(ads.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REGARDER UNE PUB
app.post('/api/watch-ad', authenticateToken, async (req, res) => {
  const { adId } = req.body;
  const userId = req.user.id;
  try {
    const recentViews = await pool.query(
      "SELECT id FROM ad_views WHERE user_id = $1 AND ad_id = $2 AND viewed_at > NOW() - INTERVAL '24 hours'",
      [userId, adId]
    );

    if (recentViews.rows.length > 0) {
      return res.status(400).json({ error: 'Vous avez déjà regardé cette publicité aujourd\'hui.' });
    }

    const adQuery = await pool.query('SELECT reward_amount FROM ads WHERE id = $1', [adId]);
    if (adQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Publicité introuvable' });
    }

    const reward = adQuery.rows[0].reward_amount;

    await pool.query(
      'INSERT INTO ad_views (user_id, ad_id, reward_claimed) VALUES ($1, $2, $3)',
      [userId, adId, reward]
    );
    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [reward, userId]);

    res.json({ message: 'Gain crédité !', reward });
  } catch (err) {
    console.error("Erreur watch-ad :", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur HUBHB démarré sur le port ${PORT}`);
});
