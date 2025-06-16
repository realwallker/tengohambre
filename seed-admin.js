const db = require('./backend/db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Puedes cambiar estos valores libremente
const adminData = {
  telefono: 'admin001',
  password: 'claveadmin2024',
  email: 'admin@tengo.com',
  nombre: 'Admin'
};

(async () => {
  const { telefono, password, email, nombre } = adminData;

  db.get('SELECT * FROM clientes WHERE telefono = ?', [telefono], async (err, row) => {
    if (err) {
      console.error('❌ Error al buscar admin:', err.message);
      process.exit(1);
    }

    if (row) {
      console.log('⚠️ Ya existe un usuario con ese teléfono:');
      console.table({
        id: row.id,
        nombre: row.nombre,
        telefono: row.telefono,
        rol: row.rol
      });
      process.exit(0);
    }

    try {
      const hash = await bcrypt.hash(password, 10);
      const id = uuidv4();

      db.run(
        `INSERT INTO clientes 
           (id, nombre, telefono, email, password, rol, hambreCoins)
         VALUES (?, ?, ?, ?, ?, 'admin', 0)`,
        [id, nombre, telefono, email, hash],
        err2 => {
          if (err2) {
            console.error('❌ Error al insertar admin:', err2.message);
            process.exit(1);
          }

          console.log('✅ Admin creado correctamente:');
          console.table({
            id,
            nombre,
            telefono,
            email,
            rol: 'admin',
            contraseña: password
          });
          process.exit(0);
        }
      );
    } catch (e) {
      console.error('❌ Error generando el hash de contraseña:', e.message);
      process.exit(1);
    }
  });
})();
