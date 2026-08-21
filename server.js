const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Route d'accueil 
const path = require('path');

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour insérer des publicités de test (à appeler une seule fois)
app.get('/api/seed-ads', async (req, res) => {
  // ... code existant des pubs ...
});

// Place le nouveau code ICI :
app.get('/api/create-test-user', async (req, res) => {
  try {
    await pool.query(
      "INSERT INTO users (id, username, email, password_hash, balance) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
      ['1', 'testuser', 'test@example.com', 'hash_test', 0]
    );
    res.json({ message: 'Utilisateur de test créé avec succès !' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Récupérer les informations de l'utilisateur (dont le solde)
app.get('/api/user/:id', async (req, res) => {
  try {
    const user = await pool.query('SELECT id, username, balance FROM users WHERE id = $1', [req.params.id]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Récupérer la liste des publicités actives
app.get('/api/ads', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ads WHERE is_active = true');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enregistrer un visionnage de pub
app.post('/api/watch-ad', async (req, res) => {
  const { userId, adId } = req.body;
  try {
    const adQuery = await pool.query('SELECT * FROM ads WHERE id = $1', [adId]);
    if (adQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Publicité introuvable' });
    }
    const ad = adQuery.rows[0];

    await pool.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [ad.reward_amount, userId]
    );

    await pool.query(
      'INSERT INTO ad_views (user_id, ad_id, reward_claimed) VALUES ($1, $2, $3)',
      [userId, adId, ad.reward_amount]
    );

    res.json({ message: 'Gain crédité avec succès !', reward: ad.reward_amount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Serveur HUBHB démarré sur le port ${PORT}`);
});
app.use(express.static(__dirname));
