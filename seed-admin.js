// seed-admin.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const supabase = require('./backend/db');

(async () => {
  const nombre = 'Admin';
  const telefono = '00000';
  const email = 'admin@tengo.com';
  const password = 'Cd470241marcelo';
  const rol = 'admin';
  const hambreCoins = 0;

  try {
    // Verificar si ya existe el admin
    const { data: existente, error: errorBuscar } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefono', telefono)
      .single();

    if (errorBuscar && errorBuscar.code !== 'PGRST116') {
      // PGRST116 = no record found, lo ignoramos
      throw errorBuscar;
    }

    if (existente) {
      console.log('⚠️ Ya existe un admin con ese teléfono:', telefono);
      console.table(existente);
      process.exit(0);
    }

    const passHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    const { error: insertError } = await supabase
      .from('clientes')
      .insert([{
        id,
        nombre,
        telefono,
        email,
        password: passHash,
        rol,
        hambreCoins
      }]);

    if (insertError) throw insertError;

    console.log('✅ Admin creado correctamente:');
    console.table({ id, nombre, telefono, email, rol, password });
  } catch (err) {
    console.error('❌ Error al crear admin:', err.message || err);
  } finally {
    process.exit();
  }
})();
