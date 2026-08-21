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

// Middleware pour verifier le Token JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acces non autorise. Token manquant.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide ou expire.' });
    req.user = user;
    next();
  });
}

// Route accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route inscription
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO users (username, email, password_hash, balance) VALUES ($1, $2, $3, $4) RETURNING id, username, balance',
      [username, email, hashedPassword, 0]
    );
    res.json({ message: 'Compte cree avec succes !', user: newUser.rows[0] });
  } catch (err) {
    console.error("Erreur inscription :", err);
    if (err.code === "23505") {
      return res.status(400).json({ error: "Email ou nom utilisateur deja utilise." });
    }
    res.status(500).json({ error: "Une erreur interne est survenue." });
  }
});

// Route connexion
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Utilisateur introuvable.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Mot de passe incorrect.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Connexion reussie !',
      token,
      user: { id: user.id, username: user.username, balance: user.balance }
    });
  } catch (err) {
    console.error("Erreur connexion :", err);
    res.status(500).json({ error: "Une erreur interne est survenue." });
  }
});

// Recuperer utilisateur connecte
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await pool.query('SELECT id, username, email, balance FROM users WHERE id = $1', [req.user.id]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recuperer les pub avec statut de visionnage sur les dernieres 24h
app.get('/api/ads', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const adsQuery = `
      SELECT a.*, 
        CASE WHEN v.id IS NOT NULL THEN true ELSE false END AS watched
      FROM ads a
      LEFT JOIN ad_views v 
        ON a.id = v.ad_id 
        AND v.user_id = $1 
        AND v.viewed_at > NOW() - INTERVAL '24 hours'
    `;
    const ads = await pool.query(adsQuery, [userId]);
    res.json(ads.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crediter le gain avec verification Anti-Triche 24h
app.post('/api/watch-ad', authenticateToken, async (req, res) => {
  const { adId } = req.body;
  const userId = req.user.id;
  try {
    // Verification du visionnage durant les 24h
    const recentView = await pool.query(
      "SELECT id FROM ad_views WHERE user_id = $1 AND ad_id = $2 AND viewed_at > NOW() - INTERVAL '24 hours'",
      [userId, adId]
    );

    if (recentView.rows.length > 0) {
      return res.status(400).json({ error: 'Vous avez deja regarde cette publicite durant les dernieres 24h.' });
    }

    const adQuery = await pool.query('SELECT reward_amount FROM ads WHERE id = $1', [adId]);
    if (adQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Publicite introuvable' });
    }

    const reward = adQuery.rows[0].reward_amount;

    await pool.query('INSERT INTO ad_views (user_id, ad_id) VALUES ($1, $2)', [userId, adId]);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [reward, userId]);

    res.json({ message: 'Gain credite avec succes !', reward });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur HUBHB demarre sur le port ${PORT}`);
});
