require('dotenv').config();
const { Pool } = require('pg');

// Crea el pool de conexión usando la URL del archivo .env
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    rejectUnauthorized: false // importante para conexiones remotas seguras
  }
});

// Método simple para hacer consultas
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
