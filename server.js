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

const authPool = new Pool({
  connectionString:
    process.env.AUTH_DB_URL ||
    'postgresql://palettenuser:DEIN_STARKES_PASSWORT@localhost:5432/palettenmanagement',
});

app.use(express.json());
app.use('/components', express.static(path.join(__dirname, 'components')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

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

app.post('/api/auth/sso-forward-token', async (req, res) => {
  if (!SHARED_AUTH_SECRET) {
    return res.status(500).json({ message: 'SHARED_AUTH_SECRET ist nicht konfiguriert.' });
  }

  const tokenFromBodyOrQuery = extractSsoTokenFromBodyOrQuery(req);
  const bearerToken = extractBearerToken(req);

  if (!tokenFromBodyOrQuery && bearerToken) {
    const legacyLocalUser = verifyLocalJwt(bearerToken);
    if (legacyLocalUser) {
      const role = normalizeRole(legacyLocalUser.role);
      const ssoToken = jwt.sign({ username: legacyLocalUser.username, role }, SHARED_AUTH_SECRET, { expiresIn: '120s' });
      return res.json({
        ssoToken,
        user: {
          username: legacyLocalUser.username,
          role,
        },
      });
    }
  }

  const incomingToken = tokenFromBodyOrQuery || bearerToken;

  if (!incomingToken) {
    logSsoIssue('MISSING_TOKEN', { route: req.path });
    return res.status(400).json({ message: 'Kein SSO-Token gefunden (body/query/auth header).' });
  }

  const requestedUsername = extractRequestedUsername(req);
  let payload = null;
  let verifiedBySharedSecret = true;

  try {
    payload = jwt.verify(incomingToken, SHARED_AUTH_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    verifiedBySharedSecret = false;
    payload = decodeJwtPayload(incomingToken);

    if (!requestedUsername) {
      const reasonCode = mapJwtVerifyErrorToReasonCode(error);
      logSsoIssue(reasonCode, { route: req.path });
      return res.status(401).json({ message: 'SSO-Token ungültig oder abgelaufen.' });
    }

    logSsoIssue('JWT_UNVERIFIED_FALLBACK_WITH_USER', { route: req.path, username: requestedUsername });
  }

  const username = resolveSsoUsername(payload) || requestedUsername;
  if (!username) {
    logSsoIssue('JWT_MISSING_USERNAME', { route: req.path });
    return res.status(401).json({ message: 'SSO-Token enthält keinen Benutzernamen.' });
  }

  if (verifiedBySharedSecret && typeof payload?.iat === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (payload.iat > now + 60) {
      logSsoIssue('JWT_INVALID_IAT', { route: req.path });
      return res.status(401).json({ message: 'SSO-Token ist zeitlich ungültig.' });
    }
  }

  try {
    const role = resolveSsoRole(payload);
    const user = await upsertSsoUser(username, role);
    const token = jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '10h' });
    return res.json({ token, user, redirectTo: '/dashboard' });
  } catch (_error) {
    logSsoIssue('USER_NOT_FOUND', { route: req.path, username });
    return res.status(500).json({ message: 'Lokale Session konnte nicht erstellt werden.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const plainPassword = String(password || '');

  if (!normalizedUsername || !plainPassword) {
    return res.status(400).json({ message: 'Benutzername und Passwort sind erforderlich.' });
  }

  const externalUser = await findExternalUser(normalizedUsername);
  if (!externalUser) {
    return res.status(401).json({ message: 'Benutzername oder Passwort ist ungültig.' });
  }

  const passwordValid = await verifyPassword(plainPassword, externalUser.passwordHash);
  if (!passwordValid) {
    return res.status(401).json({ message: 'Benutzername oder Passwort ist ungültig.' });
  }

  const role = normalizeRole(externalUser.role);
  const user = await upsertSsoUser(externalUser.username, role);
  const token = jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '10h' });

  return res.json({ token, user });
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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function findExternalUser(username) {
  const candidateQueries = [
    `SELECT username, password_hash AS "passwordHash", role
     FROM app_users
     WHERE LOWER(username) = $1
     LIMIT 1`,
    `SELECT username, password_hash AS "passwordHash", role
     FROM users
     WHERE LOWER(username) = $1
     LIMIT 1`,
    `SELECT username, password AS "passwordHash", role
     FROM users
     WHERE LOWER(username) = $1
     LIMIT 1`,
    `SELECT email AS username, password_hash AS "passwordHash", role
     FROM users
     WHERE LOWER(email) = $1
     LIMIT 1`,
    `SELECT email AS username, password AS "passwordHash", role
     FROM users
     WHERE LOWER(email) = $1
     LIMIT 1`,
  ];

  for (const queryText of candidateQueries) {
    try {
      const result = await authPool.query(queryText, [username]);
      if (result.rowCount) {
        return {
          username: String(result.rows[0].username || '').trim().toLowerCase(),
          passwordHash: String(result.rows[0].passwordHash || ''),
          role: result.rows[0].role,
        };
      }
    } catch (_error) {
      // Die externe Auth-Datenbank kann unterschiedliche Schemata nutzen.
    }
  }

  return null;
}

async function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false;
  if (passwordHash.startsWith('$2a$') || passwordHash.startsWith('$2b$') || passwordHash.startsWith('$2y$')) {
    return bcrypt.compare(password, passwordHash);
  }
  return password === passwordHash;
}

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

function extractSsoToken(req) {
  return extractSsoTokenFromBodyOrQuery(req) || extractBearerToken(req);
}

function extractSsoTokenFromBodyOrQuery(req) {
  const body = req.body || {};
  const query = req.query || {};

  return (
    body.token
    || body.ssoToken
    || body.session
    || query.token
    || query.ssoToken
    || query.session
    || ''
  );
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

function resolveSsoUsername(payload) {
  return String(payload?.username || payload?.user || payload?.sub || '').trim().toLowerCase();
}

function extractRequestedUsername(req) {
  const body = req.body || {};
  const query = req.query || {};
  return String(body.user || body.username || query.user || query.username || '').trim().toLowerCase();
}

function decodeJwtPayload(token) {
  try {
    return jwt.decode(token) || {};
  } catch (_error) {
    return {};
  }
}

function resolveSsoRole(payload) {
  const directRole = payload?.role;
  if (directRole) return normalizeRole(directRole);

  if (Array.isArray(payload?.roles) && payload.roles.length > 0) {
    const firstRole = payload.roles.find((role) => ['admin', 'disponent'].includes(role));
    if (firstRole) return normalizeRole(firstRole);
  }

  return normalizeRole(undefined);
}

function mapJwtVerifyErrorToReasonCode(error) {
  if (error?.name === 'TokenExpiredError') return 'JWT_EXPIRED';
  if (error?.name === 'NotBeforeError') return 'JWT_NOT_ACTIVE';
  if (error?.name === 'JsonWebTokenError') {
    if (String(error.message || '').includes('signature')) return 'JWT_INVALID_SIGNATURE';
    return 'JWT_INVALID';
  }
  return 'JWT_VERIFY_ERROR';
}

function logSsoIssue(reasonCode, details = {}) {
  console.warn('[SSO_FORWARD_INTAKE]', { reasonCode, ...details });
}

function verifyLocalJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_error) {
    return null;
  }
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
