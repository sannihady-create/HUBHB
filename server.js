const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Route d'accueil
app.get('/', (req, res) => {
  res.send('API HUBHB PTC en ligne');
});

// 1. Récupérer la liste des publicités actives
app.get('/api/ads', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ads WHERE is_active = true');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Enregistrer un visionnage de pub et crediter le solde
app.post('/api/watch-ad', async (req, res) => {
  const { userId, adId } = req.body;

  try {
    // Vérifier si la publicité existe
    const adQuery = await pool.query('SELECT * FROM ads WHERE id = $1', [adId]);
    if (adQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Publicité introuvable' });
    }

    const ad = adQuery.rows[0];

    // Mettre à jour le solde de l'utilisateur
    await pool.query(
      'UPDATE users SET balance = balance + $1 WHERE id = $2',
      [ad.reward_amount, userId]
    );

    // Enregistrer le visionnage
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
