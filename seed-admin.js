require('dotenv').config();
const db = require('./db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

(async () => {
  const telefono = '99999';
  const password = 'admin123';
  const email = 'admin@tengohambre.com';
  const nombre = 'Admin';

  try {
    const result = await db.query('SELECT * FROM clientes WHERE telefono = $1', [telefono]);

    if (result.rows.length > 0) {
      console.log('⚠️ El admin ya existe:', result.rows[0]);
      process.exit(0);
    }

    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await db.query(
      `INSERT INTO clientes (id, nombre, telefono, email, password, rol, hambreCoins)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, nombre, telefono, email, hash, 'admin', 0]
    );

    console.log('✅ Admin creado con éxito');
    console.table({
      id,
      nombre,
      telefono,
      email,
      password,
      rol: 'admin'
    });
    process.exit(0);
  } catch (e) {
    console.error('❌ Error al crear admin:', e);
    process.exit(1);
  }
})();
