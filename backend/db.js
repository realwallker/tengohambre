const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'tengo-hambre.db'));


db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      telefono TEXT UNIQUE,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'cliente',
      hambreCoins INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recargas (
      id TEXT PRIMARY KEY,
      clienteId TEXT,
      monto INTEGER,
      fecha TEXT
    )
  `);
});

module.exports = db;
