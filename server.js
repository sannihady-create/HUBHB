const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'hubhb_secure_secret_key_2026';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS ads (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                reward_amount DECIMAL(10, 2) DEFAULT 2.00,
                duration_seconds INT DEFAULT 30,
                active BOOLEAN DEFAULT TRUE
            );

            CREATE TABLE IF NOT EXISTS ad_views (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES users(id) ON DELETE CASCADE,
                ad_id INT REFERENCES ads(id) ON DELETE CASCADE,
                viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, ad_id)
            );
        `);

        const res = await pool.query('SELECT COUNT(*) FROM ads');
        const count = parseInt(res.rows[0].count);

        if (count === 0) {
            console.log('Création des pubs de test...');
            await pool.query(`
                INSERT INTO ads (title, reward_amount, duration_seconds, active) VALUES 
                ('Sponsor Local #1', 2.00, 30, true),
                ('Sponsor Local #2', 2.00, 30, true),
                ('Sponsor Local #3', 2.00, 30, true),
                ('Sponsor Local #4', 2.00, 30, true),
                ('Sponsor Local #5', 2.00, 30, true);
            `);
            console.log('Pubs créées avec succès !');
        }

        console.log('Base de données initialisée.');
    } catch (err) {
        console.error('Erreur DB :', err);
    }
}

initDatabase();

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Accès refusé.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalide.' });
        req.user = user;
        next();
    });
}

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, hashedPassword]
        );
        res.status(201).json({ message: 'Succès', user: newUser.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) return res.status(400).json({ error: 'Utilisateur introuvable.' });
        const user = userResult.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Mot de passe incorrect.' });
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username: user.username } });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.get('/api/ads', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const adsResult = await pool.query(`
            SELECT a.id, a.title, a.reward_amount, a.duration_seconds,
                   CASE WHEN av.id IS NOT NULL THEN true ELSE false END as watched
            FROM ads a
            LEFT JOIN ad_views av ON a.id = av.ad_id AND av.user_id = $1
            ORDER BY a.id ASC
        `, [userId]);
        res.json(adsResult.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur.' });
    }
});

app.post('/api/watch-ad', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { adId } = req.body;
        await pool.query('INSERT INTO ad_views (user_id, ad_id) VALUES ($1, $2)', [userId, adId]);
        res.json({ success: true, message: 'Validé !' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Serveur actif sur le port ${PORT}`);
});
