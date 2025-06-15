const db = require('./backend/db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

(async () => {
  const telefono = '12345';
  const password = 'jirafas';
  const email = 'admin@tengo.com';
  const nombre = 'Admin';

  // Verificar si ya existe un admin con ese teléfono
  db.get('SELECT * FROM clientes WHERE telefono = ?', [telefono], async (err, row) => {
    if (err) {
      console.error('❌ Error al buscar admin:', err);
      process.exit(1);
    }

    if (row) {
      console.log('⚠️ Ya existe un usuario con ese teléfono:', telefono);
      console.table({
        id: row.id,
        nombre: row.nombre,
        telefono: row.telefono,
        rol: row.rol
      });
      process.exit(0);
    }

    const passHash = await bcrypt.hash(password, 10);
    const adminId = uuidv4();

    db.run(
      `INSERT INTO clientes 
         (id, nombre, telefono, email, password, rol, hambreCoins)
       VALUES (?, ?, ?, ?, ?, 'admin', 0)`,
      [adminId, nombre, telefono, email, passHash],
      err2 => {
        if (err2) {
          console.error('❌ Error al crear admin:', err2);
        } else {
          console.log('✅ Admin creado exitosamente:');
          console.table({
            id: adminId,
            nombre,
            telefono,
            email,
            rol: 'admin',
            contraseña: password
          });
        }
        process.exit();
      }
    );
  });
})();
