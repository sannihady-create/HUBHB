const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs'); // Placé ici tout en haut

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Route d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour insérer des publicités de test
app.get('/api/seed-ads', async (req, res) => {
  // ... ton code d'insertion de pubs ...
});

// Route d'inscription
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO users (username, email, password_hash, balance) VALUES ($1, $2, $3, $4) RETURNING id, username, balance',
      [username, email, hashedPassword, 0]
    );
    res.json({ message: 'Compte créé avec succès !', user: newUser.rows[0] });
  } catch (err) {
    res.status(400).json({ error: "Email ou nom d'utilisateur déjà utilisé." });
  }
});

// Route de connexion
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Utilisateur introuvable.' });

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(400).json({ error: 'Mot de passe incorrect.' });

    res.json({
      message: 'Connexion réussie !',
      user: { id: user.id, username: user.username, balance: user.balance }
    });
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

// Enregistrer le visionnage et créditer le gain
app.post('/api/watch-ad', async (req, res) => {
  const { userId, adId } = req.body;
  try {
    const adQuery = await pool.query('SELECT reward_amount FROM ads WHERE id = $1', [adId]);
    if (adQuery.rows.length === 0) return res.status(404).json({ error: 'Publicité introuvable' });

    const reward = adQuery.rows[0].reward_amount;

    await pool.query('INSERT INTO ad_views (user_id, ad_id) VALUES ($1, $2)', [userId, adId]);
    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [reward, userId]);

    res.json({ message: 'Gain crédité avec succès !', reward });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Récupérer les informations utilisateur
app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await pool.query('SELECT id, username, balance FROM users WHERE id = $1', [req.params.id]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
