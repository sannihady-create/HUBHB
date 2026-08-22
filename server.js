async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ads (
                id SERIAL PRIMARY KEY,
                title VARCHAR(100) NOT NULL,
                ad_url VARCHAR(255) DEFAULT 'https://example.com',
                reward_amount DECIMAL(10,2) DEFAULT 25.00,
                duration_seconds INT DEFAULT 30
            );
        `);

        // Insérer des publicités par défaut si la table est vide
        const checkAds = await pool.query('SELECT COUNT(*) FROM ads');
        if (parseInt(checkAds.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO ads (title, ad_url, reward_amount, duration_seconds) VALUES 
                ('Regarder la vidéo Sponsor 1', 'https://example.com/ad1', 50.00, 30),
                ('Découvrir l offre Partenaire 2', 'https://example.com/ad2', 25.00, 20),
                ('Visiter le site Sponsor 3', 'https://example.com/ad3', 100.00, 45);
            `);
            console.log("Publicités de test ajoutées avec succès !");
        }

        console.log("Base de données initialisée avec succès.");
    } catch (err) {
        console.error("Erreur init DB:", err.message);
    }
}
