require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const supabase = require('./db');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_segura';

app.use(cors({
  origin: 'https://tengohambre.vercel.app',
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Middleware
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = payload;
    next();
  });
}

function authorizeRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  };
}

// Rutas públicas
app.get('/', (req, res) => res.send('Servidor funcionando 👌'));

app.post('/api/registro', async (req, res) => {
  const { nombre, telefono, email, password } = req.body;
  if (!nombre || !telefono || !email || !password) {
    return res.status(400).json({ error: 'Faltan datos' });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    const { error } = await supabase.from('clientes').insert([{
      id,
      nombre,
      telefono,
      email,
      password: hash,
      rol: 'cliente',
      hambreCoins: 0
    }]);

    if (error) throw error;

    res.json({ message: 'Registrado correctamente', id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar' });
  }
});

app.post('/api/login', async (req, res) => {
  const { telefono, password } = req.body;
  if (!telefono || !password) return res.status(400).json({ error: 'Faltan datos' });

  try {
    const { data: users, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('telefono', telefono)
      .limit(1);

    if (error) throw error;
    const user = users[0];
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign({ id: user.id, rol: user.rol }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, rol: user.rol, id: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// Obtener todos los clientes (admin)
app.get('/api/clientes', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre, telefono, email, rol, hambreCoins');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// Obtener perfil de cliente por ID (admin o el mismo cliente)
app.get('/api/clientes/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;

  if (req.user.rol !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Acceso prohibido' });
  }

  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre, telefono, email, hambreCoins')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al buscar cliente' });
  }
});


// Recarga de hambreCoins (puede ser positiva o negativa)
app.post('/api/clientes/:id/cargar', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { monto } = req.body;

  const parsedMonto = Number(monto);
  if (!Number.isFinite(parsedMonto)) {
    return res.status(400).json({ error: 'Monto inválido' });
  }

  try {
  const { data: cliente, error: getError } = await supabase
    .from('clientes')
    .select('hambreCoins')
    .eq('id', id)
    .single();

    if (getError || !cliente) throw getError || new Error('Cliente no encontrado');

  const nuevoTotal = cliente.hambreCoins + monto;

  const { error: updateError } = await supabase
    .from('clientes')
    .update({ hambreCoins: nuevoTotal })
    .eq('id', id);

  const recargaId = uuidv4();
  const fecha = new Date().toISOString();

    const { error: insertError } = await supabase
    .from('recargas')
    .insert([{ id: recargaId, clienteId: id, monto, fecha }]);

  if (updateError || insertError) throw updateError || insertError;

     // ✅ Aquí la respuesta clara que tu frontend espera:
  return res.status(200).json({
    success: true,
    message: 'Coins cargadas correctamente',
    nuevoTotal,
  });
} catch (error) {
  console.error('❌ Error en /cargar:', error);
  return res.status(500).json({
    success: false,
    error: 'Error al recargar coins',
    details: error.message || error,
  });
}
});

// Obtener historial de recargas
app.get('/api/clientes/:id/recargas', authenticateJWT, async (req, res) => {
  const { id } = req.params;

   console.log("🔍 Comparando IDs:", req.user.id, id);
   if (req.user.rol !== 'admin' && String(req.user.id) !== String(id)) {
    return res.status(403).json({ error: 'Acceso prohibido' });
  }

  try {
    const { data, error } = await supabase
      .from('recargas')
      .select('fecha, monto')
      .eq('clienteId', id)
      .order('fecha', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener recargas' });
  }
});

// Eliminar cliente
app.delete('/api/clientes/:id', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    await supabase.from('recargas').delete().eq('clienteId', id);
    const { error, data } = await supabase.from('clientes').delete().eq('id', id);

    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
});
// Crear un canje
app.post('/api/canjes', authenticateJWT, authorizeRole('cliente'), async (req, res) => {
  const { clienteId, promocionId } = req.body;

  if (req.user.id !== clienteId) {
    return res.status(403).json({ error: 'No autorizado para canjear por otro cliente' });
  }

  try {
    // Obtener cliente y promo
    const { data: cliente, error: errCliente } = await supabase
      .from('clientes')
      .select('hambreCoins')
      .eq('id', clienteId)
      .single();

    const { data: promo, error: errPromo } = await supabase
      .from('promociones')
      .select('valorCoins, titulo')
      .eq('id', promocionId)
      .single();

    if (errCliente || !cliente) throw errCliente || new Error('Cliente no encontrado');
    if (errPromo || !promo) throw errPromo || new Error('Promoción no encontrada');

    if (cliente.hambreCoins < promo.valorCoins) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    // Generar código de canje único
    const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Descontar coins y guardar canje
    const { error: updateError } = await supabase
      .from('clientes')
      .update({ hambreCoins: cliente.hambreCoins - promo.valorCoins })
      .eq('id', clienteId);

    const { error: insertError } = await supabase
      .from('canjes')
      .insert([{
        clienteid: clienteId,
        promocionid: promocionId,
        codigo,
        usado: false
      }]);

    if (updateError || insertError) throw updateError || insertError;

    return res.status(200).json({
      success: true,
      mensaje: 'Canje registrado',
      codigo,
      promocion: promo.titulo
    });
  } catch (error) {
    console.error('❌ Error al crear canje:', error);
    return res.status(500).json({ error: 'Error al procesar el canje' });
  }
});

// Consultar canje por código (admin)
app.get('/api/canjes/:codigo', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  const { codigo } = req.params;

  try {
    const { data, error } = await supabase
      .from('canjes')
      .select('id, codigo, usado, fecha, promociones(titulo), clientes(nombre)')
      .eq('codigo', codigo)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Código no válido' });
    }

    return res.json(data);
  } catch (error) {
    console.error('❌ Error al validar código:', error);
    res.status(500).json({ error: 'Error al buscar el canje' });
  }
});

app.get('/api/canjes/cliente/:clienteId', authenticateJWT, authorizeRole('cliente'), async (req, res) => {
  const { clienteId } = req.params;

  if (req.user.id !== clienteId) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  try {
    const { data, error } = await supabase
      .from('canjes')
      .select('codigo, usado, fecha, promociones(titulo)')
      .eq('clienteid', clienteId)
      .order('fecha', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('❌ Error al obtener canjes del cliente:', error);
    res.status(500).json({ error: 'Error al obtener canjes' });
  }
});

// Obtener promociones activas (clientes)
app.get('/api/promociones', authenticateJWT, authorizeRole('cliente','admin'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('promociones')
      .select('id, titulo, descripcion, valorCoins, imagenUrl')
      .eq('activo', true)
      .order('titulo', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error en GET /promociones:', err);
    res.status(500).json({ error: 'No se pudieron obtener promociones' });
  }
});



// Confirmar entrega del canje
app.post('/api/canjes/:codigo/confirmar', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  const { codigo } = req.params;

  try {
    const { data, error } = await supabase
      .from('canjes')
      .select('usado')
      .eq('codigo', codigo)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Código no válido' });
    if (data.usado) return res.status(400).json({ error: 'Este canje ya fue utilizado' });

    const { error: updateError } = await supabase
      .from('canjes')
      .update({ usado: true })
      .eq('codigo', codigo);

    if (updateError) throw updateError;

    res.json({ message: '✅ Canje confirmado y marcado como usado' });
  } catch (error) {
    console.error('❌ Error al confirmar canje:', error);
    res.status(500).json({ error: 'Error al confirmar entrega del canje' });
  }
});

// Validar código de canje escaneado (QR)
app.post('/api/canjes/validar', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  const { codigo } = req.body;

  try {
    const { data, error } = await supabase
      .from('canjes')
      .select(`
        id, usado, codigo,
        cliente:clienteid (nombre),
        promo:promocionid (titulo)
      `)
      .eq('codigo', codigo)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Código no encontrado' });
    }

    if (data.usado) {
      return res.status(400).json({ success: false, error: 'Este código ya fue utilizado' });
    }

    // Marcar como usado
    await supabase
      .from('canjes')
      .update({ usado: true })
      .eq('id', data.id);

    return res.status(200).json({
      success: true,
      clienteNombre: data.cliente.nombre,
      promocionTitulo: data.promo.titulo
    });
  } catch (error) {
    console.error('❌ Error al validar canje:', error);
    return res.status(500).json({ success: false, error: 'Error en el servidor' });
  }
});


// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
