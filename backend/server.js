require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_segura';

app.use(cors({
  origin: 'https://tengohambre.vercel.app',
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Middleware de autenticación
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

    await db.query(
      `INSERT INTO clientes (id, nombre, telefono, email, password, rol, hambreCoins)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, nombre, telefono, email, hash, 'cliente', 0]
    );

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
    const result = await db.query('SELECT * FROM clientes WHERE telefono = $1', [telefono]);
    const user = result.rows[0];
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

// Clientes
app.get('/api/clientes', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  try {
    const result = await db.query('SELECT id, nombre, telefono, email, rol, hambreCoins FROM clientes');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

app.get('/api/clientes/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  if (req.user.rol === 'cliente' && req.user.id !== id) {
    return res.status(403).json({ error: 'Acceso prohibido' });
  }

  try {
    const result = await db.query(
      'SELECT id, nombre, telefono, email, hambreCoins FROM clientes WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al buscar cliente' });
  }
});

// Recargas
app.post('/api/clientes/:id/cargar', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { monto } = req.body;
  if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

  try {
    await db.query(
      'UPDATE clientes SET hambreCoins = hambreCoins + $1 WHERE id = $2',
      [monto, id]
    );

    const recargaId = uuidv4();
    const fecha = new Date().toISOString();

    await db.query(
      'INSERT INTO recargas (id, clienteId, monto, fecha) VALUES ($1, $2, $3, $4)',
      [recargaId, id, monto, fecha]
    );

    res.json({ message: 'Coins cargadas correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al recargar coins' });
  }
});

app.get('/api/clientes/:id/recargas', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  if (req.user.rol === 'cliente' && req.user.id !== id) {
    return res.status(403).json({ error: 'Acceso prohibido' });
  }

  try {
    const result = await db.query(
      'SELECT fecha, monto FROM recargas WHERE clienteId = $1 ORDER BY fecha DESC',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener recargas' });
  }
});

app.delete('/api/clientes/:id', authenticateJWT, authorizeRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM recargas WHERE clienteId = $1', [id]);
    const result = await db.query('DELETE FROM clientes WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ message: 'Cliente eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar cliente' });
  }
});

// Inicio del servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
