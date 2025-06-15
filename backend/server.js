const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_super_secreta';

app.use(cors({
  origin: 'https://tengohambre.vercel.app', // Dominio de tu frontend
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Middleware de autenticación y autorización
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = payload;
    next();
  });
}

function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Access forbidden' });
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
    db.run(
      'INSERT INTO clientes (id, nombre, telefono, email, password, rol, hambreCoins) VALUES (?, ?, ?, ?, ?, ?, 0)',
      [id, nombre, telefono, email, hash, 'cliente'],
      err => {
        if (err) return res.status(500).json({ error: 'Error al registrar' });
        res.json({ message: 'Registrado', id });
      }
    );
  } catch (e) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/login', async (req, res) => {
  const { telefono, password } = req.body;
  if (!telefono || !password) {
    return res.status(400).json({ error: 'Faltan teléfono o contraseña' });
  }

  db.get('SELECT * FROM clientes WHERE telefono = ?', [telefono], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Error al buscar usuario' });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, rol: user.rol, id: user.id });
  });
});

app.get('/api/recargas/:clienteId', (req, res) => {
  const { clienteId } = req.params;
  db.all('SELECT * FROM recargas WHERE clienteId = ? ORDER BY fecha DESC', [clienteId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener recargas' });
    res.status(200).json(rows);
  });
});

// Rutas protegidas
app.get('/api/clientes', authenticateJWT, authorizeRole('admin'), (req, res) => {
  db.all('SELECT id, nombre, telefono, email, rol, hambreCoins FROM clientes', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener clientes' });
    res.json(rows);
  });
});

app.get('/api/clientes/:id', authenticateJWT, (req, res) => {
  const { id } = req.params;
  if (req.user.rol === 'cliente' && req.user.id !== id) {
    return res.status(403).json({ error: 'Acceso prohibido' });
  }
  db.get('SELECT id, nombre, telefono, email, hambreCoins FROM clientes WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error al buscar cliente' });
    if (!row) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(row);
  });
});

app.delete('/api/clientes/:id', authenticateJWT, authorizeRole('admin'), (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM clientes WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar cliente' });
    db.run('DELETE FROM recargas WHERE clienteId = ?', [id]);
    if (this.changes === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json({ message: 'Cliente eliminado' });
  });
});

app.post('/api/clientes/:id/cargar', authenticateJWT, authorizeRole('admin'), (req, res) => {
  const { id } = req.params;
  const { monto } = req.body;
  if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

  db.run('UPDATE clientes SET hambreCoins = hambreCoins + ? WHERE id = ?', [monto, id], function (err) {
    if (err) return res.status(500).json({ error: 'Error al cargar coins' });
    if (this.changes === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

    const recargaId = uuidv4();
    const fecha = new Date().toISOString();
    db.run('INSERT INTO recargas(id, clienteId, monto, fecha) VALUES(?, ?, ?, ?)', [recargaId, id, monto, fecha], err2 => {
      if (err2) return res.status(500).json({ error: 'Error al guardar historial' });
      res.json({ message: 'Coins cargadas y registradas' });
    });
  });
});

app.get('/api/clientes/:id/recargas', authenticateJWT, (req, res) => {
  const { id } = req.params;
  if (req.user.rol === 'cliente' && req.user.id !== id) {
    return res.status(403).json({ error: 'Acceso prohibido' });
  }
  db.all('SELECT fecha, monto FROM recargas WHERE clienteId = ? ORDER BY fecha DESC', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener historial' });
    res.json(rows);
  });
});

app.get('/api/clientes/:id/canjes', authenticateJWT, (req, res) => {
  const clienteId = req.params.id;
  if (req.user.rol === 'cliente' && req.user.id !== clienteId) {
    return res.status(403).json({ error: 'Acceso prohibido' });
  }
  db.all(
    `SELECT c.fecha, p.nombre, p.costo
     FROM canjes c
     JOIN promociones p ON c.promoId = p.id
     WHERE c.clienteId = ?
     ORDER BY c.fecha DESC`,
    [clienteId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener canjes' });
      res.json(rows);
    }
  );
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
