const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Connexion à la base de données PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const JWT_SECRET = process.env.JWT_SECRET || 'cle_secrete_hubhb_2026';

// Middleware pour vérifier la connexion de l'utilisateur
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: "Accès refusé. Token manquant." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token invalide." });
        req.user = user;
        next();
    });
};

// 1. INSCRIPTION
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "Tous les champs sont requis." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, hashedPassword]
        );

        res.status(201).json({ message: "Compte créé avec succès !", user: newUser.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ error: "Nom d'utilisateur ou email déjà utilisé." });
        }
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 2. CONNEXION
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const userQuery = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userQuery.rows.length === 0) {
            return res.status(400).json({ error: "Identifiants incorrects." });
        }

        const user = userQuery.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(400).json({ error: "Identifiants incorrects." });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                balance: user.balance,
                daily_ad_count: user.daily_ad_count
            }
        });
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 3. RECUPERER LE PROFIL & REMETTRE A ZERO LE COMPTEUR CHAQUE JOUR
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const userQuery = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        let user = userQuery.rows[0];

        if (user.last_ad_date.toISOString().split('T')[0] !== today) {
            await pool.query(
                'UPDATE users SET daily_ad_count = 0, last_ad_date = $1 WHERE id = $2',
                [today, user.id]
            );
            user.daily_ad_count = 0;
        }

        res.json({
            username: user.username,
            balance: parseFloat(user.balance),
            dailyAdCount: user.daily_ad_count,
            walletAddress: user.wallet_address
        });
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur." });
    }
});

// 4. VALIDER LA VISIONNAGE D'UNE PUBLICITE (+0,003 $)
app.post('/api/watch-ad', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const userQuery = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        let user = userQuery.rows[0];

        let currentCount = user.daily_ad_count;
        if (user.last_ad_date.toISOString().split('T')[0] !== today) {
            currentCount = 0;
        }

        if (currentCount >= 50) {
            return res.status(400).json({ error: "Limite quotidienne de 50 publicités atteinte." });
        }

        const newCount = currentCount + 1;
        const newBalance = parseFloat(user.balance) + 0.003;

        await pool.query(
            'UPDATE users SET balance = $1, daily_ad_count = $2, last_ad_date = $3 WHERE id = $4',
            [newBalance, newCount, today, user.id]
        );

        res.json({ success: true, balance: newBalance, adsToday: newCount });
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur." });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Serveur HUBHB démarré sur le port ${PORT}`));
