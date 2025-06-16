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

    const nuevoTotal = cliente.hambreCoins + parsedMonto;

    const { error: updateError } = await supabase
      .from('clientes')
      .update({ hambreCoins: nuevoTotal })
      .eq('id', id);

    const recargaId = uuidv4();
    const fecha = new Date().toISOString();

    const { error: insertError } = await supabase
      .from('recargas')
      .insert([{ id: recargaId, clienteId: id, monto: parsedMonto, fecha }]);

    if (updateError || insertError) throw updateError || insertError;

    res.status(200).json({ success: true, message: 'Coins cargadas correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al recargar coins' });
  }
});

// Obtener historial de recargas
app.get('/api/clientes/:id/recargas', authenticateJWT, async (req, res) => {
  const { id } = req.params;

  if (req.user.rol !== 'admin' && req.user.id !== id) {
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

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
