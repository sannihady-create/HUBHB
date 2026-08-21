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

// Middleware pour vérifier le Token JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(01).json({ error: 'Accès non autorisé. Token manquant.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide ou expiré.' });
    req.user = user;
    next();
  });
}

// Route d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route inscription avec gestion erreurs
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

// Route de connexion avec génération de Token
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

    // Génération du token JWT valide 24h
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
    res.status(500).json({ error: "Une erreur interne est survenue." });
  }
});

// Récupérer les informations de l'utilisateur connecté (Protégé)
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await pool.query('SELECT id, username, email, balance FROM users WHERE id = $1', [req.user.id]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Récupérer la liste des pubs
app.get('/api/ads', async (req, res) => {
  try {
    const ads = await pool.query('SELECT * FROM ads');
    res.json(ads.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enregistrer le visionnage et créditer le gain (Protégé)
app.post('/api/watch-ad', authenticateToken, async (req, res) => {
  const { adId } = req.body;
  const userId = req.user.id;
  try {
    const adQuery = await pool.query('SELECT reward_amount FROM ads WHERE id = $1', [adId]);
    if (adQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Publicité introuvable' });
    }

    const reward = adQuery.rows[0].reward_amount;

    await pool.query('INSERT INTO ad_views (user_id, ad_id) VALUES ($1, $2)', [userId, adId]);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [reward, userId]);

    res.json({ message: 'Gain crédité avec succès !', reward });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur HUBHB démarré sur le port ${PORT}`);
});
