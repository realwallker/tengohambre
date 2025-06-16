require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('./db'); // Asegúrate de que db.js esté correctamente configurado

(async () => {
  const nombre = 'Admin';
  const telefono = '99999';
  const email = 'admin@tengo.com';
  const password = 'jirafas';
  const hashedPassword = await bcrypt.hash(password, 10);
  const id = uuidv4();

  try {
    // Verificar si ya existe
    const { rows } = await db.query(
      'SELECT * FROM clientes WHERE telefono = $1',
      [telefono]
    );

    if (rows.length > 0) {
      console.log('⚠️ Ya existe un admin con ese teléfono:', telefono);
      console.table(rows[0]);
      process.exit(0);
    }

    // Insertar nuevo admin
    await db.query(
      `INSERT INTO clientes (id, nombre, telefono, email, password, rol, hambreCoins)
       VALUES ($1, $2, $3, $4, $5, 'admin', 0)`,
      [id, nombre, telefono, email, hashedPassword]
    );

    console.log('✅ Admin creado con éxito:');
    console.table({ id, nombre, telefono, email, rol: 'admin', contraseña: password });
  } catch (err) {
    console.error('❌ Error al crear admin:', err);
  } finally {
    process.exit();
  }
})();
