// db.js
require('dotenv').config();
const { Pool } = require('pg');

// Configuración de conexión a Supabase
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // necesario para conexiones seguras con Supabase
  },
});

module.exports = db;
