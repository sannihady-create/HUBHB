const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const insertAdsQuery = `
INSERT INTO ads (title, ad_url, reward_amount, duration_seconds) 
VALUES 
  ('Publicité Sponsorisée #1', 'https://example.com/ad1', 0.0500, 15),
  ('Visiter notre partenaire #2', 'https://example.com/ad2', 0.1000, 30),
  ('Découvrir la nouvelle offre #3', 'https://example.com/ad3', 0.0200, 10);
`;

async function seedAds() {
  try {
    await pool.query(insertAdsQuery);
    console.log('Publicités de test ajoutées avec succès !');
  } catch (err) {
    console.error('Erreur lors de l\'ajout des pubs :', err);
  } finally {
    await pool.end();
  }
}

seedAds();
