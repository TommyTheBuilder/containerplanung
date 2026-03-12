const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3005);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const SHARED_AUTH_SECRET = process.env.SHARED_AUTH_SECRET || '';
const SSO_LOGIN_URL = process.env.SSO_LOGIN_URL || 'https://test.paletten-ms.de/login.html';

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'containerplanung',
  user: process.env.DB_USER || 'containerplanung',
  password: process.env.DB_PASSWORD || 'ctpl11',
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/auth/sso/config', (_req, res) => {
  res.json({ loginUrl: SSO_LOGIN_URL });
});

app.post('/api/auth/sso-exchange', async (req, res) => {
  if (!SHARED_AUTH_SECRET) {
    return res.status(500).json({ message: 'SHARED_AUTH_SECRET ist nicht konfiguriert.' });
  }

  const { ssoToken } = req.body || {};
  if (!ssoToken) {
    return res.status(400).json({ message: 'ssoToken ist erforderlich.' });
  }

  let payload;
  try {
    payload = jwt.verify(ssoToken, SHARED_AUTH_SECRET, { algorithms: ['HS256'] });
  } catch (_error) {
    return res.status(401).json({ message: 'SSO-Token ungültig oder abgelaufen.' });
  }

  const username = String(payload.username || payload.email || '').trim().toLowerCase();
  if (!username) {
    return res.status(400).json({ message: 'SSO-Token enthält keinen Benutzernamen.' });
  }

  const role = normalizeRole(payload.role);
  const user = await upsertSsoUser(username, role);

  const token = jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '10h' });
  return res.json({ token, user });
});

app.post('/api/auth/sso-token', (req, res) => {
  if (!SHARED_AUTH_SECRET) {
    return res.status(500).json({ message: 'SHARED_AUTH_SECRET ist nicht konfiguriert.' });
  }

  const headerSecret = req.headers['x-auth-secret'];
  if (headerSecret !== SHARED_AUTH_SECRET) {
    return res.status(403).json({ message: 'Kein Zugriff auf SSO-Token-Erzeugung.' });
  }

  const { username, role = 'disponent', ttlSeconds = 120 } = req.body || {};
  if (!username) {
    return res.status(400).json({ message: 'username ist erforderlich.' });
  }

  const token = jwt.sign(
    { username: String(username).trim().toLowerCase(), role: normalizeRole(role) },
    SHARED_AUTH_SECRET,
    { expiresIn: Math.max(30, Number(ttlSeconds) || 120) },
  );

  return res.json({ ssoToken: token });
});

app.get('/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    return res.json({ ok: true, db: result.rows[0].now });
  } catch (error) {
    return res.status(500).json({ ok: false, message: 'DB nicht erreichbar', error: error.message });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT id, username, role FROM app_users WHERE id = $1', [req.user.sub]);
  if (!result.rowCount) return res.status(404).json({ message: 'Benutzer nicht gefunden' });
  return res.json(result.rows[0]);
});

app.get('/api/bookings', requireAuth, async (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ message: 'Parameter month im Format YYYY-MM erforderlich.' });
  }

  const from = `${month}-01`;
  const toDate = new Date(`${from}T00:00:00`);
  toDate.setMonth(toDate.getMonth() + 1);
  const to = toDate.toISOString().slice(0, 10);

  const result = await pool.query(
    `SELECT id, title, container_no AS "containerNo", customer, plate, order_no AS "orderNo", booking_date::text AS date, color
     FROM bookings
     WHERE booking_date >= $1 AND booking_date < $2
     ORDER BY booking_date ASC, created_at ASC`,
    [from, to],
  );

  return res.json(result.rows);
});

app.post('/api/bookings', requireAuth, authorizeRoles('admin', 'disponent'), async (req, res) => {
  const { title, containerNo, customer, plate, orderNo, date, color } = req.body || {};
  if (!title || !containerNo || !customer || !plate || !orderNo || !date) {
    return res.status(400).json({ message: 'Alle Buchungsfelder sind erforderlich.' });
  }

  const result = await pool.query(
    `INSERT INTO bookings (title, container_no, customer, plate, order_no, booking_date, color, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, title, container_no AS "containerNo", customer, plate, order_no AS "orderNo", booking_date::text AS date, color`,
    [title, containerNo, customer, plate, orderNo, date, color || '#0ea5e9', req.user.sub],
  );

  return res.status(201).json(result.rows[0]);
});

app.delete('/api/bookings/:id', requireAuth, authorizeRoles('admin', 'disponent'), async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('DELETE FROM bookings WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) return res.status(404).json({ message: 'Eintrag nicht gefunden.' });
  return res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Nicht authentifiziert.' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (_error) {
    return res.status(401).json({ message: 'Token ungültig oder abgelaufen.' });
  }
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Keine Berechtigung.' });
    return next();
  };
}

function normalizeRole(role) {
  return ['admin', 'disponent'].includes(role) ? role : 'disponent';
}

async function upsertSsoUser(username, role) {
  const existing = await pool.query('SELECT id, username, role FROM app_users WHERE username = $1', [username]);
  if (existing.rowCount) {
    const user = existing.rows[0];
    if (user.role !== role) {
      const updated = await pool.query('UPDATE app_users SET role = $2 WHERE id = $1 RETURNING id, username, role', [user.id, role]);
      return updated.rows[0];
    }
    return user;
  }

  const randomPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);
  const created = await pool.query(
    `INSERT INTO app_users (username, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, username, role`,
    [username, randomPasswordHash, role],
  );

  return created.rows[0];
}

async function initDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);

  const adminUser = process.env.SEED_ADMIN_USER || 'admin';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ctpl11';
  const hash = await bcrypt.hash(adminPassword, 10);

  await pool.query(
    `INSERT INTO app_users (username, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (username) DO NOTHING`,
    [adminUser, hash],
  );
}

async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Containerplanung läuft auf Port ${PORT}`);
  });
}

start().catch((error) => {
  console.error('Serverstart fehlgeschlagen:', error);
  process.exit(1);
});
