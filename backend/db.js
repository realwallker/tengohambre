const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    rejectUnauthorized: false // necesario para Supabase y Render
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params)
};
