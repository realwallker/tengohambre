// seed-admin.js
const db = require('./backend/db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

(async () => {
  const password = 'jirafas';     // <— cámbiala por la contraseña que quieras
  const passHash = await bcrypt.hash(password, 10);
  const adminId = uuidv4();

  db.run(
    `INSERT OR IGNORE INTO clientes 
       (id, nombre, telefono, email, password, rol, hambreCoins)
     VALUES (?, ?, ?, ?, ?, 'admin', 0)`,
    [adminId, 'Admin', '12345', 'admin@tengo.com', passHash],
    err => {
      if (err) {
        console.error('Error al crear admin:', err);
      } else {
        console.log('✅ Admin creado con ID:', adminId);
        console.log('   Teléfono: 12345');
        console.log('   Contraseña:', password);
      }
      process.exit();
    }
  );
})();
