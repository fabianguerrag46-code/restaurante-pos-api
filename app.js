const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Conexión a PostgreSQL en Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com'))
    ? { rejectUnauthorized: false }
    : false
});

app.use(cors());
app.use(express.json());

// Servir la carpeta public donde estará index.html
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar tablas en la base de datos
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mesas (
        id INT PRIMARY KEY,
        items JSONB DEFAULT '[]'::jsonb,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY,
        fecha VARCHAR(20),
        hora VARCHAR(20),
        mesa_id INT,
        items JSONB NOT NULL,
        subtotal NUMERIC(12, 2) NOT NULL,
        tip NUMERIC(12, 2) NOT NULL,
        total NUMERIC(12, 2) NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const checkMesas = await pool.query('SELECT COUNT(*) FROM mesas');
    if (parseInt(checkMesas.rows[0].count) === 0) {
      for (let i = 1; i <= 8; i++) {
        await pool.query('INSERT INTO mesas (id, items) VALUES ($1, $2)', [i, '[]']);
      }
    }
    console.log('✅ Base de datos configurada para Las Delicias de Salomé.');
  } catch (err) {
    console.error('❌ Error al inicializar tablas:', err.message);
  }
}
initDB();

// Ruta raíz: entrega el archivo index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rutas de API
app.get('/api/mesas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, items FROM mesas ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mesas', async (req, res) => {
  const { id, items } = req.body;
  try {
    await pool.query(
      `INSERT INTO mesas (id, items, actualizado_en)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET items = EXCLUDED.items, actualizado_en = CURRENT_TIMESTAMP`,
      [id, JSON.stringify(items)]
    );
    res.json({ status: 'ok', mesaId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ventas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM ventas ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ventas', async (req, res) => {
  const { fecha, hora, mesaId, items, subtotal, tip, total } = req.body;
  try {
    const query = `
      INSERT INTO ventas (fecha, hora, mesa_id, items, subtotal, tip, total)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [fecha, hora, mesaId, JSON.stringify(items), subtotal, tip, total];
    const { rows } = await pool.query(query, values);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ventas', async (req, res) => {
  try {
    await pool.query('DELETE FROM ventas');
    res.json({ status: 'ok', mensaje: 'Historial de ventas reiniciado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', servicio: 'Las Delicias de Salomé POS' });
});

app.listen(PORT, () => {
  console.log(`Servidor POS activo en el puerto ${PORT}`);
});
