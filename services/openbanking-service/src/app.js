// services/openbanking-service/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

const helmet = require('helmet');
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// Swagger setup
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Open Banking Service API', version: '1.0.0', description: 'TrueLayer Open Banking integration' },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
    }
  },
  apis: ['./src/app.js']
});
app.use('/api-docs', authenticateToken, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'openbankingdb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// TrueLayer constants
const TL_AUTH_BASE = 'https://auth.truelayer-sandbox.com';
const TL_DATA_BASE = 'https://api.truelayer-sandbox.com/data/v1';

// Initialize DB tables
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bank_connections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      provider TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS auth_states (
      state TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Database tables initialized');
}

// JWT auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Refresh TrueLayer token if needed, return valid access token
async function getValidAccessToken(userId) {
  const result = await pool.query(
    'SELECT * FROM bank_connections WHERE user_id = $1',
    [userId]
  );
  if (result.rows.length === 0) throw new Error('No bank connection found');

  const conn = result.rows[0];
  const now = new Date();
  const expiresAt = new Date(conn.expires_at);

  // Refresh if less than 60 seconds remaining
  if (expiresAt.getTime() - now.getTime() < 60000) {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.TRUELAYER_CLIENT_ID,
      client_secret: process.env.TRUELAYER_CLIENT_SECRET,
      refresh_token: conn.refresh_token,
    });
    const response = await axios.post(`${TL_AUTH_BASE}/connect/token`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const { access_token, refresh_token, expires_in } = response.data;
    const newExpiry = new Date(Date.now() + expires_in * 1000);
    await pool.query(
      `UPDATE bank_connections
       SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = NOW()
       WHERE user_id = $4`,
      [access_token, refresh_token || conn.refresh_token, newExpiry, userId]
    );
    return access_token;
  }

  return conn.access_token;
}

// Clean up expired auth states (older than 10 minutes)
async function cleanExpiredStates() {
  await pool.query(
    `DELETE FROM auth_states WHERE created_at < NOW() - INTERVAL '10 minutes'`
  );
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'openbanking-service', timestamp: new Date().toISOString() });
});

/**
 * @swagger
 * /api/openbanking/auth-url:
 *   get:
 *     summary: Get TrueLayer authorization URL
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Auth URL and state token
 */
app.get('/api/openbanking/auth-url', authenticateToken, async (req, res) => {
  try {
    await cleanExpiredStates();
    const state = crypto.randomBytes(16).toString('hex');
    await pool.query(
      'INSERT INTO auth_states (state, user_id) VALUES ($1, $2)',
      [state, req.user.userId]
    );
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.TRUELAYER_CLIENT_ID,
      scope: 'accounts balance offline_access',
      redirect_uri: process.env.TRUELAYER_REDIRECT_URI,
      providers: 'mock',
      state,
    });
    const url = `${TL_AUTH_BASE}/?${params.toString()}`;
    res.json({ url, state });
  } catch (err) {
    console.error('auth-url error:', err);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

/**
 * @swagger
 * /api/openbanking/callback:
 *   get:
 *     summary: OAuth callback from TrueLayer (server-side, no auth required)
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirects to app deep link on success
 */
app.get('/api/openbanking/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code || !state) {
    console.error('TrueLayer auth error:', error || 'missing params');
    return res.send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Error</title><style>body{font-family:-apple-system,sans-serif;text-align:center;padding:80px 24px;background:#fef2f2;margin:0}
h2{color:#dc2626}p{color:#374151;font-size:14px}</style></head>
<body><div style="font-size:56px;margin-bottom:16px">✕</div><h2>Connection Failed</h2>
<p>${error || 'An error occurred'}. Please close this window and try again.</p></body></html>`);
  }

  try {
    // Look up user from state (CSRF protection)
    const stateResult = await pool.query(
      'SELECT user_id FROM auth_states WHERE state = $1',
      [state]
    );
    if (stateResult.rows.length === 0) {
      return res.redirect('wealthmanager://openbanking/error?reason=invalid_state');
    }
    const userId = stateResult.rows[0].user_id;
    await pool.query('DELETE FROM auth_states WHERE state = $1', [state]);

    // Exchange code for tokens
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.TRUELAYER_CLIENT_ID,
      client_secret: process.env.TRUELAYER_CLIENT_SECRET,
      code,
      redirect_uri: process.env.TRUELAYER_REDIRECT_URI,
    });
    const response = await axios.post(`${TL_AUTH_BASE}/connect/token`, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Upsert bank connection
    await pool.query(
      `INSERT INTO bank_connections (user_id, access_token, refresh_token, expires_at, provider, updated_at)
       VALUES ($1, $2, $3, $4, 'truelayer', NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET access_token = $2, refresh_token = $3, expires_at = $4, provider = 'truelayer', updated_at = NOW()`,
      [userId, access_token, refresh_token, expiresAt]
    );

    // Return a success page — also attempts the custom scheme for iOS standalone builds.
    // The mobile app checks status after the browser session closes (works on Expo Go too).
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Bank Connected</title>
  <style>
    body { font-family: -apple-system, sans-serif; text-align: center;
           padding: 80px 24px; background: #f0fdf4; margin: 0; }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h2 { color: #16a34a; font-size: 22px; margin: 0 0 8px; }
    p { color: #374151; font-size: 15px; margin: 0; }
  </style>
</head>
<body>
  <div class="icon">✓</div>
  <h2>Bank Connected!</h2>
  <p>You can now close this window and return to the app.</p>
  <script>
    // Attempt custom-scheme redirect so iOS ASWebAuthenticationSession
    // can intercept and auto-dismiss the browser session.
    setTimeout(function() {
      window.location = 'wealthmanager://openbanking/success';
    }, 300);
  </script>
</body>
</html>`);
  } catch (err) {
    console.error('callback error:', err.response?.data || err.message);
    const errDetail = err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connection Failed</title>
  <style>
    body { font-family: -apple-system, sans-serif; text-align: center;
           padding: 60px 24px; background: #fef2f2; margin: 0; }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h2 { color: #dc2626; font-size: 22px; margin: 0 0 8px; }
    p { color: #374151; font-size: 14px; margin: 0 0 16px; }
    pre { background: #fff; border: 1px solid #fca5a5; border-radius: 8px;
          padding: 12px; font-size: 12px; text-align: left; word-break: break-all;
          white-space: pre-wrap; color: #7f1d1d; }
  </style>
</head>
<body>
  <div class="icon">✕</div>
  <h2>Connection Failed</h2>
  <p>Please close this window and try again.</p>
  <pre>${errDetail}</pre>
</body>
</html>`);
  }
});

/**
 * @swagger
 * /api/openbanking/status:
 *   get:
 *     summary: Check if user has a connected bank
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection status
 */
app.get('/api/openbanking/status', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id FROM bank_connections WHERE user_id = $1',
      [req.user.userId]
    );
    res.json({ connected: result.rows.length > 0 });
  } catch (err) {
    console.error('status error:', err);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

/**
 * @swagger
 * /api/openbanking/accounts:
 *   get:
 *     summary: Fetch bank accounts and balances
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of accounts with balances
 */
app.get('/api/openbanking/accounts', authenticateToken, async (req, res) => {
  try {
    const accessToken = await getValidAccessToken(req.user.userId);
    const headers = { Authorization: `Bearer ${accessToken}` };

    // Fetch accounts
    const accountsRes = await axios.get(`${TL_DATA_BASE}/accounts`, { headers });
    const accounts = accountsRes.data.results || [];

    // Fetch balance for each account in parallel
    const accountsWithBalance = await Promise.all(
      accounts.map(async (acct) => {
        try {
          const balRes = await axios.get(`${TL_DATA_BASE}/accounts/${acct.account_id}/balance`, { headers });
          const balance = balRes.data.results?.[0]?.current ?? 0;
          return {
            account_id: acct.account_id,
            display_name: acct.display_name,
            account_type: acct.account_type,
            currency: acct.currency,
            balance,
            provider: acct.provider?.display_name || 'Bank',
          };
        } catch {
          return {
            account_id: acct.account_id,
            display_name: acct.display_name,
            account_type: acct.account_type,
            currency: acct.currency,
            balance: 0,
            provider: acct.provider?.display_name || 'Bank',
          };
        }
      })
    );

    res.json({ accounts: accountsWithBalance });
  } catch (err) {
    console.error('accounts error:', err.response?.data || err.message);
    if (err.message === 'No bank connection found') {
      return res.status(404).json({ error: 'No bank connection found. Please connect your bank first.' });
    }
    res.status(500).json({ error: 'Failed to fetch accounts', detail: err.response?.data?.error || err.message });
  }
});

/**
 * @swagger
 * /api/openbanking/disconnect:
 *   delete:
 *     summary: Disconnect bank (remove stored tokens)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Disconnected successfully
 */
app.delete('/api/openbanking/disconnect', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM bank_connections WHERE user_id = $1', [req.user.userId]);
    res.json({ disconnected: true });
  } catch (err) {
    console.error('disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

const PORT = process.env.PORT || 3007;
app.listen(PORT, async () => {
  await initDB();
  console.log(`Open Banking Service running on port ${PORT}`);
});

module.exports = app;
