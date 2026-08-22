const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'hubhb_secure_secret_key_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Initialisation non bloquante et propre de la base de données
pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        balance DECIMAL(10,2) DEFAULT 0.00
    );
    CREATE TABLE IF NOT EXISTS ads (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        ad_url VARCHAR(255) DEFAULT 'https://example.com',
        reward_amount DECIMAL(10,2) DEFAULT 25.00,
        duration_seconds INT DEFAULT 30
    );
`).then(async () => {
    // Insérer des pubs par défaut si la table est vide
    const check = await pool.query('SELECT COUNT(*) FROM ads');
    if (parseInt(check.rows[0].count) === 0) {
        await pool.query(`
            INSERT INTO ads (title, ad_url, reward_amount, duration_seconds) VALUES 
            ('Regarder la vidéo Sponsor 1', 'https://example.com/ad1', 50.00, 30),
            ('Découvrir l offre Partenaire 2', 'https://example.com/ad2', 25.00, 20),
            ('Visiter le site Sponsor 3', 'https://example.com/ad3', 100.00, 45);
        `);
    }
    console.log("Base de données initialisée et prête.");
}).catch(err => console.error("Erreur init DB:", err.message));

// API : Inscription
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Tous les champs sont requis.' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, hashedPassword]
        );
        res.status(201).json({ message: 'Compte créé avec succès', user: newUser.rows[0] });
    } catch (err) {
        if (err.code === '23505') {
            res.status(400).json({ error: 'Cet email ou nom d\'utilisateur est déjà pris.' });
        } else {
            res.status(500).json({ error: 'Erreur serveur lors de l\'inscription.' });
        }
    }
});

// API : Connexion
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Utilisateur introuvable. Créez un compte.' });
        }
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ error: 'Mot de passe incorrect.' });
        }
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
    }
});

// API : Récupérer les pubs
app.get('/api/ads', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM ads');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Erreur chargement publicités.' });
    }
});

// Route universelle frontend
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Serveur HUBHB actif sur le port ${PORT}`);
});
