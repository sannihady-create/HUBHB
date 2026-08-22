require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET; // pas de valeur par défaut : on veut que ça plante si elle manque, plutôt que d'utiliser un secret connu de tous

if (!JWT_SECRET) {
  console.error('ERREUR : la variable d\'environnement JWT_SECRET doit être définie.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());

// On sert uniquement le dossier "public" (à créer si tu ne l'as pas encore),
// pas le dossier racine du serveur (ça évite d'exposer server.js et le .env)
app.use(express.static(path.join(__dirname, 'public')));

// Création automatique de la table users si elle n'existe pas encore
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

// Route de test simple pour vérifier que le serveur répond
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Le serveur HUBHB tourne parfaitement !' });
});

// Authentification : Inscription
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );
    res.status(201).json({ message: 'Compte créé avec succès', user: newUser.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      res.status(400).json({ error: "Cet email ou nom d'utilisateur est déjà utilisé." });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur interne.' });
    }
  }
});

// Authentification : Connexion
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Utilisateur non trouvé.' });
    }
    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Mot de passe incorrect.' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

// Redirection vers le frontend (catch-all)
// Syntaxe compatible Express 5 : "/*splat" au lieu de "*" seul
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Serveur HUBHB actif sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Erreur lors de l\'initialisation de la base de données :', err);
    process.exit(1);
  });
