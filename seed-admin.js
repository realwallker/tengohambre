require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('./backend/db');

(async () => {
  const nombre = 'Admin';
  const telefono = '00000';
  const email = 'admin@tengo.com';
  const password = 'Cd470241marcelo';
  const rol = 'admin';
  const hambreCoins = 0;

  try {
    // Verificar si ya existe un admin con ese teléfono
    const result = await db.query('SELECT * FROM clientes WHERE telefono = $1', [telefono]);

    if (result.rows.length > 0) {
      console.log('⚠️ Ya existe un admin con ese teléfono:', telefono);
      console.table(result.rows[0]);
      process.exit(0);
    }

    const passHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await db.query(
      `INSERT INTO clientes (id, nombre, telefono, email, password, rol, hambreCoins)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, nombre, telefono, email, passHash, rol, hambreCoins]
    );

    console.log('✅ Admin creado correctamente:');
    console.table({ id, nombre, telefono, email, rol, password });
  } catch (error) {
    console.error('❌ Error al crear admin:', error);
  } finally {
    process.exit();
  }
})();
