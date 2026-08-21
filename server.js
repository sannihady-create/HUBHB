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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ROUTE INSCRIPTION
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
    res.json({ message: 'Compte cree avec succes !', user: newUser.rows[0] });
  } catch (err) {
    console.error("Erreur inscription :", err);
    if (err.code === "23505") {
      return res.status(400).json({ error: "Email ou nom d'utilisateur déjà utilisé." });
    }
    res.status(500).json({ error: "Une erreur interne est survenue lors de l'inscription." });
  }
});

// ROUTE CONNEXION CORRIGÉE
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
      message: 'Connexion reussie !',
      token,
      user: { id: user.id, username: user.username, balance: user.balance }
    });
  } catch (err) {
    console.error("Erreur connexion :", err);
    res.status(500).json({ error: "Une erreur interne est survenue." });
  }
});

app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const user = await pool.query('SELECT id, username, email, balance FROM users WHERE id = $1', [req.user.id]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    
    const promo = await pool.query("SELECT id FROM user_promos WHERE user_id = $1 AND code = 'EXAUCÉE'", [req.user.id]);
    const hasPromo = promo.rows.length > 0;

    res.json({ ...user.rows[0], hasPromo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/apply-promo', authenticateToken, async (req, res) => {
  const { code } = req.body;
  const userId = req.user.id;

  if (!code || code.trim().toUpperCase() !== 'EXAUCÉE') {
    return res.status(400).json({ error: 'Code promo invalide.' });
  }

  try {
    const existing = await pool.query("SELECT id FROM user_promos WHERE user_id = $1 AND code = 'EXAUCÉE'", [userId]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Vous avez deja active ce code promo.' });
    }

    await pool.query("INSERT INTO user_promos (user_id, code) VALUES ($1, 'EXAUCÉE')", [userId]);
    res.json({ message: 'Code EXAUCÉE active ! Vous pouvez regarder chaque pub 5 fois par 24h.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ads', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const promo = await pool.query("SELECT id FROM user_promos WHERE user_id = $1 AND code = 'EXAUCÉE'", [userId]);
    const maxViews = promo.rows.length > 0 ? 5 : 1;

    const adsQuery = `
      SELECT a.*, 
        COUNT(v.id) as views_count,
        CASE WHEN COUNT(v.id) >= $2 THEN true ELSE false END AS watched
      FROM ads a
      LEFT JOIN ad_views v 
        ON a.id = v.ad_id 
        AND v.user_id = $1 
        AND v.viewed_at > NOW() - INTERVAL '24 hours'
      GROUP BY a.id
    `;
    const ads = await pool.query(adsQuery, [userId, maxViews]);
    res.json(ads.rows.map(ad => ({ ...ad, maxViews })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/watch-ad', authenticateToken, async (req, res) => {
  const { adId } = req.body;
  const userId = req.user.id;
  try {
    const promo = await pool.query("SELECT id FROM user_promos WHERE user_id = $1 AND code = 'EXAUCÉE'", [userId]);
    const maxViews = promo.rows.length > 0 ? 5 : 1;

    const recentViews = await pool.query(
      "SELECT id FROM ad_views WHERE user_id = $1 AND ad_id = $2 AND viewed_at > NOW() - INTERVAL '24 hours'",
      [userId, adId]
    );

    if (recentViews.rows.length >= maxViews) {
      return res.status(400).json({ error: `Limite atteinte (${maxViews} vues / 24h) pour cette publicite.` });
    }

    const adQuery = await pool.query('SELECT reward_amount FROM ads WHERE id = $1', [adId]);
    if (adQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Publicite introuvable' });
    }

    const reward = adQuery.rows[0].reward_amount;

    await pool.query(
      'INSERT INTO ad_views (user_id, ad_id, reward_claimed) VALUES ($1, $2, $3)',
      [userId, adId, reward]
    );
    await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [reward, userId]);

    res.json({ message: 'Gain credite avec succes !', reward });
  } catch (err) {
    console.error("Erreur watch-ad :", err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/withdraw', authenticateToken, async (req, res) => {
  const { amount, paymentMethod, accountDetails } = req.body;
  const userId = req.user.id;
  const minWithdrawal = 1.00;

  if (!amount || amount < minWithdrawal) {
    return res.status(400).json({ error: `Le montant minimum de retrait est de ${minWithdrawal} $.` });
  }

  try {
    const userQuery = await pool.query('SELECT balance FROM users WHERE id = $1', [userId]);
    const currentBalance = parseFloat(userQuery.rows[0].balance);

    if (currentBalance < amount) {
      return res.status(400).json({ error: 'Solde insuffisant pour effectuer ce retrait.' });
    }

    await pool.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, userId]);
    await pool.query(
      'INSERT INTO withdrawals (user_id, amount, payment_method, account_details) VALUES ($1, $2, $3, $4)',
      [userId, amount, paymentMethod, accountDetails]
    );

    res.json({ message: 'Demande de retrait enregistree avec succes !' });
  } catch (err) {
    console.error("Erreur retrait :", err);
    res.status(500).json({ error: "Une erreur est survenue lors de la demande." });
  }
});

app.get('/api/withdrawals', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT amount, payment_method, account_details, status, created_at FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur HUBHB demarre sur le port ${PORT}`);
});
