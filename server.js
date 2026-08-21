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

// Route pour insérer des publicités de test (à appeler une seule fois)
app.get('/api/seed-ads', async (req, res) => {
  try {
    const insertAdsQuery = `
      INSERT INTO ads (title, ad_url, reward_amount, duration_seconds) 
      VALUES 
        ('Publicité Sponsorisée #1', 'https://example.com/ad1', 0.0500, 15),
        ('Visiter notre partenaire #2', 'https://example.com/ad2', 0.1000, 30),
        ('Découvrir la nouvelle offre #3', 'https://example.com/ad3', 0.0200, 10);
    `;
    await pool.query(insertAdsQuery);
    res.json({ message: 'Publicités de test ajoutées avec succès !' });
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
