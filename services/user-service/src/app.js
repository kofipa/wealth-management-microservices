// services/user-service/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const amqp = require('amqplib');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');

// ── password validation ───────────────────────────────────────────────────────
const BLOCKED_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234',
  'passw0rd', 'p@ssword', 'p@ssw0rd',
  '12345678', '123456789', '1234567890', '87654321',
  'qwerty123', 'qwertyuiop',
  'abc123456', 'abc12345',
  'letmein', 'letmein1',
  'welcome1', 'welcome123',
  'iloveyou', 'iloveyou1',
  'clearwelth', 'clearwelth1',
  'monkey123', 'dragon123', 'sunshine1',
]);

function validatePassword(password) {
  if (!password || password.length < 10) {
    return 'Password must be at least 10 characters';
  }
  if (BLOCKED_PASSWORDS.has(password.toLowerCase())) {
    return 'This password is too easy to guess — try a longer phrase or mix in some numbers';
  }
  return null;
}

// ── startup env check ────────────────────────────────────────────────────────
const REQUIRED_VARS = ['FIELD_ENCRYPTION_KEY', 'JWT_SECRET', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'RABBITMQ_URL'];
const missing = REQUIRED_VARS.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('FATAL: Missing required environment variables:', missing.join(', '));
  process.exit(1);
}
console.log('Env check OK. Keys present:', REQUIRED_VARS.map(k => k + '=' + (process.env[k] ? '***' : 'MISSING')).join(', '));

// ── PII field encryption (AES-256-GCM) ──────────────────────────────────────
const ENC_KEY = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, 'hex');
if (ENC_KEY.length !== 32) {
  console.error('FATAL: FIELD_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  process.exit(1);
}

function encrypt(text) {
  if (text == null || text === '') return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(encryptedBase64) {
  if (encryptedBase64 == null || encryptedBase64 === '') return encryptedBase64;
  try {
    const buf = Buffer.from(encryptedBase64, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// Deterministic HMAC for email lookup (email never stored plaintext)
function emailHmac(email) {
  return crypto.createHmac('sha256', ENC_KEY).update((email || '').toLowerCase().trim()).digest('hex');
}

function decryptProfile(row) {
  if (!row) return row;
  return {
    ...row,
    email: row.email ? (decrypt(row.email) ?? row.email) : row.email,
    first_name: decrypt(row.first_name),
    last_name: decrypt(row.last_name),
    phone: decrypt(row.phone),
    date_of_birth: decrypt(row.date_of_birth),
    address: decrypt(row.address),
  };
}
// ────────────────────────────────────────────────────────────────────────────

// ── Email sending (Resend) ───────────────────────────────────────────────────
const _resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail(to, subject, html) {
  try {
    await _resend.emails.send({
      from: process.env.FROM_EMAIL,
      to,
      subject,
      html,
    });
    console.log(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error('Resend error:', err.message);
  }
}
// ────────────────────────────────────────────────────────────────────────────

const app = express();
app.use(helmet());
const _corsOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : true;
app.use(cors({
  origin: _corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: 'Too many reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many password reset attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3,
  message: { error: 'Too many resend requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Swagger setup
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'User Service API', version: '1.0.0', description: 'User authentication and profile management' },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
    }
  },
  apis: ['./src/app.js']
});
app.use('/api-docs', authenticateToken, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-user',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'userdb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// RabbitMQ connection
let channel;
const EXCHANGE_NAME = 'wealth_management_events';

async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672', { connectionTimeout: 5000 });
    channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    console.log('Connected to RabbitMQ');
  } catch (err) {
    console.error('RabbitMQ connection error:', err);
    setTimeout(connectRabbitMQ, 5000);
  }
}

// Publish event to RabbitMQ
async function publishEvent(eventType, data) {
  if (channel) {
    const message = JSON.stringify({ eventType, data, timestamp: new Date() });
    channel.publish(EXCHANGE_NAME, eventType, Buffer.from(message));
    console.log(`Published event: ${eventType}`);
  }
}

// Initialize database schema
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone VARCHAR(20),
        date_of_birth DATE,
        address TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add last_login_at if it doesn't exist yet
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
    `);

    // Email verification columns
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(64)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_expiry TIMESTAMP`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255)`);

    // Widen PII columns to TEXT for encrypted storage
    await client.query(`ALTER TABLE user_profiles ALTER COLUMN phone TYPE TEXT`);
    await client.query(`ALTER TABLE user_profiles ALTER COLUMN date_of_birth TYPE TEXT`);
    await client.query(`ALTER TABLE user_profiles ALTER COLUMN address TYPE TEXT`);

    // Security question columns
    await client.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS security_question TEXT`);
    await client.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS security_answer_hash TEXT`);

    // Token version for session revocation on password change
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`);

    // Pseudonymisation: encrypt email, add HMAC lookup index, widen first/last name for encryption
    await client.query(`ALTER TABLE users ALTER COLUMN email TYPE TEXT`);
    await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_hash VARCHAR(64)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_hash_idx ON users(email_hash) WHERE email_hash IS NOT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email_hash VARCHAR(64)`);
    await client.query(`ALTER TABLE user_profiles ALTER COLUMN first_name TYPE TEXT`);
    await client.query(`ALTER TABLE user_profiles ALTER COLUMN last_name TYPE TEXT`);

    // One-time migration: encrypt existing plaintext emails and compute hashes
    const plainEmails = await client.query(`SELECT id, email FROM users WHERE email_hash IS NULL`);
    for (const row of plainEmails.rows) {
      await client.query(
        `UPDATE users SET email = $1, email_hash = $2 WHERE id = $3`,
        [encrypt(row.email), emailHmac(row.email), row.id]
      );
    }

    // One-time migration: encrypt existing plaintext first_name / last_name
    const plainProfiles = await client.query(
      `SELECT id, first_name, last_name FROM user_profiles WHERE first_name IS NOT NULL OR last_name IS NOT NULL`
    );
    for (const row of plainProfiles.rows) {
      let fn = row.first_name;
      let ln = row.last_name;
      let changed = false;
      if (fn && decrypt(fn) === null) { fn = encrypt(fn); changed = true; }
      if (ln && decrypt(ln) === null) { ln = encrypt(ln); changed = true; }
      if (changed) {
        await client.query(
          `UPDATE user_profiles SET first_name = $1, last_name = $2 WHERE id = $3`,
          [fn, ln, row.id]
        );
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS nominees (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        nominee_email VARCHAR(255) NOT NULL,
        nominee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        inactivity_days INTEGER NOT NULL DEFAULT 30,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner_id, nominee_email)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(10) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database initialized');
  } finally {
    client.release();
  }
}

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    // Delegated tokens (isDelegated: true) intentionally omit tokenVersion so they
    // are NOT revoked when the account owner changes their password. This is by design:
    // delegation grants persistent read access until the nominee explicitly exits or
    // the owner removes the nominee. To revoke a delegated session, remove the nominee
    // via DELETE /api/users/nominees/:id.
    if (user.tokenVersion !== undefined) {
      try {
        const result = await pool.query('SELECT token_version FROM users WHERE id = $1', [user.userId]);
        if (result.rows.length === 0 || result.rows[0].token_version !== user.tokenVersion) {
          return res.status(403).json({ error: 'Session expired. Please log in again.' });
        }
      } catch (dbErr) {
        console.error('Token version check failed:', dbErr);
        return res.status(500).json({ error: 'Authentication error' });
      }
    }
    req.user = user;
    next();
  });
}

// Routes

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       409:
 *         description: User already exists
 */
app.post('/api/users/register', registerLimiter, async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (email, email_hash, password_hash) VALUES ($1, $2, $3) RETURNING id, created_at',
      [encrypt(email.toLowerCase().trim()), emailHmac(email), passwordHash]
    );

    const user = result.rows[0];

    // Generate email verification token (24h expiry)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE users SET verification_token = $1, token_expiry = $2 WHERE id = $3',
      [verificationToken, tokenExpiry, user.id]
    );

    // Send verification email
    const verifyUrl = `${process.env.APP_URL}/api/users/verify-email?token=${verificationToken}`;
    await sendEmail(
      email,
      'Verify your Wealth Manager account',
      `<h2>Welcome to Wealth Manager!</h2>
       <p>Please click the button below to verify your email address. The link expires in 24 hours.</p>
       <p style="margin:24px 0">
         <a href="${verifyUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
           Verify my email
         </a>
       </p>
       <p style="color:#6b7280;font-size:13px">Or copy this link into your browser:<br>${verifyUrl}</p>`
    );

    // Save name to user_profiles if provided
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      const first_name = parts[0];
      const last_name = parts.slice(1).join(' ') || null;
      await pool.query(
        'INSERT INTO user_profiles (user_id, first_name, last_name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [user.id, encrypt(first_name), last_name ? encrypt(last_name) : null]
      );
    }

    // Publish UserRegistered event
    await publishEvent('user.registered', { userId: user.id, email: email.toLowerCase().trim() });

    res.status(201).json({
      message: 'Registration successful. Please check your email to verify your account.',
    });
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      res.status(409).json({ error: 'User already exists' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login and receive a JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Returns JWT token
 *       401:
 *         description: Invalid credentials
 */
app.post('/api/users/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email_hash = $1', [emailHmac(email)]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const plainEmail = decrypt(user.email) || email.toLowerCase().trim();
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email address before logging in.',
        unverified: true,
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: plainEmail, tokenVersion: user.token_version },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Record last login and auto-link any pending nominations for this email
    try {
      await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
      await pool.query(
        `UPDATE nominees SET nominee_user_id = $1, status = 'accepted'
         WHERE nominee_email = $2 AND nominee_user_id IS NULL`,
        [user.id, plainEmail]
      );
    } catch (e) {
      console.error('Post-login update error (non-fatal):', e.message);
    }

    // Publish UserLoggedIn event
    await publishEvent('user.logged_in', { userId: user.id, email: plainEmail });

    res.json({ token, userId: user.id, email: plainEmail });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * @swagger
 * /api/users/profile:
 *   post:
 *     summary: Create or update user profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               phone:
 *                 type: string
 *               date_of_birth:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile saved
 *       401:
 *         description: Unauthorized
 */
app.post('/api/users/profile', authenticateToken, async (req, res) => {
  const { first_name, last_name, phone, date_of_birth, address } = req.body;
  const userId = req.user.userId;

  try {
    // Check if profile exists
    const existing = await pool.query(
      'SELECT id FROM user_profiles WHERE user_id = $1',
      [userId]
    );

    let result;
    if (existing.rows.length === 0) {
      // Insert new profile — encrypt PII fields
      result = await pool.query(
        `INSERT INTO user_profiles (user_id, first_name, last_name, phone, date_of_birth, address)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, encrypt(first_name), encrypt(last_name), encrypt(phone), encrypt(date_of_birth), encrypt(address)]
      );

      // Publish UserProfileAdded event
      await publishEvent('user.profile.added', { userId, profile: decryptProfile(result.rows[0]) });
    } else {
      // Update existing profile — encrypt PII fields
      result = await pool.query(
        `UPDATE user_profiles
         SET first_name = $1, last_name = $2, phone = $3, date_of_birth = $4, address = $5, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $6 RETURNING *`,
        [encrypt(first_name), encrypt(last_name), encrypt(phone), encrypt(date_of_birth), encrypt(address), userId]
      );

      // Publish UserProfileUpdated event
      await publishEvent('user.profile.updated', { userId, profile: decryptProfile(result.rows[0]) });
    }

    res.json({ profile: decryptProfile(result.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get the authenticated user's profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `SELECT u.id, u.email, p.first_name, p.last_name, p.phone, p.date_of_birth, p.address, p.security_question
       FROM users u
       LEFT JOIN user_profiles p ON u.id = p.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ profile: decryptProfile(result.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// --- Nominee / Trusted Contacts Routes ---

app.post('/api/users/nominees', authenticateToken, async (req, res) => {
  const { email, inactivity_days } = req.body;
  const ownerId = req.user.userId;

  if (!email || inactivity_days === undefined || inactivity_days === null) {
    return res.status(400).json({ error: 'email and inactivity_days are required' });
  }
  if (email === req.user.email) {
    return res.status(400).json({ error: 'You cannot nominate yourself' });
  }

  try {
    // Check if nominee already has an account
    const existingUser = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHmac(email)]);
    const nomineeUserId = existingUser.rows.length > 0 ? existingUser.rows[0].id : null;
    const status = nomineeUserId ? 'accepted' : 'pending';

    const result = await pool.query(
      `INSERT INTO nominees (owner_id, nominee_email, nominee_user_id, inactivity_days, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (owner_id, nominee_email) DO UPDATE
         SET inactivity_days = EXCLUDED.inactivity_days,
             nominee_user_id = COALESCE(nominees.nominee_user_id, EXCLUDED.nominee_user_id),
             status = COALESCE(nominees.status, EXCLUDED.status)
       RETURNING *`,
      [ownerId, email, nomineeUserId, inactivity_days, status]
    );

    // Send notification email to nominee
    const ownerProfile = await pool.query(
      'SELECT first_name, last_name FROM user_profiles WHERE user_id = $1',
      [ownerId]
    );
    const ownerRow = ownerProfile.rows[0];
    const ownerName = ownerRow
      ? [decrypt(ownerRow.first_name), decrypt(ownerRow.last_name)].filter(Boolean).join(' ') || req.user.email
      : req.user.email;

    if (status === 'accepted') {
      await sendEmail(
        email,
        "You've been added as a trusted contact on Wealth Manager",
        `<h2>You're a trusted contact</h2>
         <p><strong>${ownerName}</strong> has added you as a trusted contact on Wealth Manager.</p>
         <p>You can log in to the app to access their delegated account if they ever activate access for you.</p>`
      );
    } else {
      await sendEmail(
        email,
        "You've been nominated as a trusted contact on Wealth Manager",
        `<h2>You've been nominated</h2>
         <p><strong>${ownerName}</strong> has nominated you as a trusted contact on Wealth Manager.</p>
         <p>Download the Wealth Manager app and register with this email address to accept the nomination.</p>`
      );
    }

    res.status(201).json({ nominee: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not add nominee' });
  }
});

app.get('/api/users/nominees', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM nominees WHERE owner_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json({ nominees: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch nominees' });
  }
});

app.delete('/api/users/nominees/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM nominees WHERE id = $1 AND owner_id = $2 RETURNING id',
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nominee not found' });
    }
    res.json({ message: 'Nominee removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not remove nominee' });
  }
});

app.put('/api/users/nominees/:id', authenticateToken, async (req, res) => {
  const { email, inactivity_days } = req.body;
  const ownerId = req.user.userId;

  if (!email || inactivity_days === undefined || inactivity_days === null) {
    return res.status(400).json({ error: 'email and inactivity_days are required' });
  }
  if (email === req.user.email) {
    return res.status(400).json({ error: 'You cannot nominate yourself' });
  }

  try {
    const existingUser = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHmac(email)]);
    const nomineeUserId = existingUser.rows.length > 0 ? existingUser.rows[0].id : null;
    const status = nomineeUserId ? 'accepted' : 'pending';

    const result = await pool.query(
      `UPDATE nominees
       SET nominee_email = $1, inactivity_days = $2, nominee_user_id = $3, status = $4
       WHERE id = $5 AND owner_id = $6
       RETURNING *`,
      [email, inactivity_days, nomineeUserId, status, req.params.id, ownerId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nominee not found' });
    }
    res.json({ nominee: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update nominee' });
  }
});

app.get('/api/users/delegated-accounts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.owner_id, u.email AS owner_email, p.first_name AS owner_first_name, p.last_name AS owner_last_name, n.inactivity_days, u.last_login_at
       FROM nominees n
       JOIN users u ON u.id = n.owner_id
       LEFT JOIN user_profiles p ON p.user_id = n.owner_id
       WHERE n.nominee_user_id = $1 AND n.status = 'accepted'`,
      [req.user.userId]
    );

    const accounts = result.rows.map((row) => {
      const lastLogin = row.last_login_at ? new Date(row.last_login_at) : null;
      const daysSince = lastLogin
        ? (Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;
      const accessAvailable = daysSince >= row.inactivity_days;
      const daysRemaining = accessAvailable ? 0 : Math.ceil(row.inactivity_days - daysSince);
      const plainOwnerEmail = decrypt(row.owner_email) ?? row.owner_email;
      const plainOwnerFirst = decrypt(row.owner_first_name);
      const plainOwnerLast = decrypt(row.owner_last_name);
      return {
        owner_id: row.owner_id,
        owner_email: plainOwnerEmail,
        owner_name: [plainOwnerFirst, plainOwnerLast].filter(Boolean).join(' ') || plainOwnerEmail,
        inactivity_days: row.inactivity_days,
        last_login_at: row.last_login_at,
        access_available: accessAvailable,
        days_remaining: daysRemaining,
      };
    });

    res.json({ accounts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch delegated accounts' });
  }
});

app.post('/api/users/delegate/:ownerId', authenticateToken, async (req, res) => {
  const nomineeId = req.user.userId;
  const ownerId = parseInt(req.params.ownerId);

  try {
    const nomineeCheck = await pool.query(
      `SELECT n.inactivity_days, u.email AS owner_email, p.first_name AS owner_first_name, p.last_name AS owner_last_name, u.last_login_at
       FROM nominees n
       JOIN users u ON u.id = n.owner_id
       LEFT JOIN user_profiles p ON p.user_id = n.owner_id
       WHERE n.owner_id = $1 AND n.nominee_user_id = $2 AND n.status = 'accepted'`,
      [ownerId, nomineeId]
    );

    if (nomineeCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { inactivity_days, owner_email: _owner_email_enc, owner_first_name, owner_last_name, last_login_at } = nomineeCheck.rows[0];
    const owner_email = decrypt(_owner_email_enc) ?? _owner_email_enc;
    const owner_name = [decrypt(owner_first_name), decrypt(owner_last_name)].filter(Boolean).join(' ') || owner_email;
    const lastLogin = last_login_at ? new Date(last_login_at) : null;
    const daysSince = lastLogin
      ? (Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (daysSince < inactivity_days) {
      return res.status(403).json({
        error: `Account holder is still active. Access available after ${Math.ceil(inactivity_days - daysSince)} more days of inactivity.`,
      });
    }

    const token = jwt.sign(
      { userId: ownerId, email: owner_email, isDelegated: true, delegatedBy: nomineeId },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, owner_email, owner_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not issue delegated token' });
  }
});

// --- Forgot / Reset Password Routes ---

app.post('/api/users/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHmac(email)]);
    // Always return success to avoid leaking whether the email exists
    if (userResult.rows.length === 0) {
      return res.json({ message: 'If that email exists, a reset code has been sent.' });
    }

    const userId = userResult.rows[0].id;
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
      [userId, code]
    );

    await sendEmail(
      email,
      'Your Wealth Manager password reset code',
      `<h2>Password Reset</h2>
       <p>Your 6-digit reset code is:</p>
       <h1 style="letter-spacing:8px;font-size:36px;">${code}</h1>
       <p>This code expires in 15 minutes. If you didn't request a reset, you can ignore this email.</p>`
    );

    res.json({ message: 'If that email exists, a reset code has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate reset code' });
  }
});

app.post('/api/users/reset-password', resetPasswordLimiter, async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'email, token and newPassword are required' });
  }
  const pwErr = validatePassword(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });

  try {
    const result = await pool.query(
      `SELECT prt.id FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token = $1
         AND prt.used = FALSE
         AND prt.expires_at > NOW()
         AND u.email_hash = $2`,
      [token, emailHmac(email)]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    const tokenId = result.rows[0].id;
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await pool.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE email_hash = $2',
      [passwordHash, emailHmac(email)]
    );
    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE id = $1',
      [tokenId]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

/**
 * @swagger
 * /api/users/change-password:
 *   post:
 *     summary: Change authenticated user's password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [current_password, new_password]
 *             properties:
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         description: Current password incorrect
 */
app.post('/api/users/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  const userId = req.user.userId;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  const pwErr = validatePassword(new_password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2',
      [newHash, userId]
    );
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not change password' });
  }
});

app.post('/api/users/change-email', authenticateToken, async (req, res) => {
  const { new_email, password } = req.body;
  const userId = req.user.userId;

  if (!new_email || !password) {
    return res.status(400).json({ error: 'new_email and password are required' });
  }

  try {
    // Verify current password
    const userResult = await pool.query('SELECT password_hash, email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const valid = await bcrypt.compare(password, userResult.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }
    if (emailHmac(new_email) === emailHmac(decrypt(userResult.rows[0].email) || '')) {
      return res.status(400).json({ error: 'New email is the same as your current email' });
    }

    // Check new email not already taken
    const taken = await pool.query('SELECT id FROM users WHERE email_hash = $1', [emailHmac(new_email)]);
    if (taken.rows.length > 0) {
      return res.status(409).json({ error: 'That email address is already in use' });
    }

    // Store pending email (encrypted) + send verification
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE users SET pending_email = $1, pending_email_hash = $2, verification_token = $3, token_expiry = $4 WHERE id = $5',
      [encrypt(new_email.toLowerCase().trim()), emailHmac(new_email), token, expiry, userId]
    );

    const verifyUrl = `${process.env.APP_URL}/api/users/verify-email?token=${token}`;
    await sendEmail(
      new_email,
      'Confirm your new email address — Wealth Manager',
      `<h2>Confirm your new email</h2>
       <p>Click the button below to confirm <strong>${new_email}</strong> as your Wealth Manager email address. The link expires in 24 hours.</p>
       <p style="margin:24px 0">
         <a href="${verifyUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
           Confirm new email
         </a>
       </p>
       <p style="color:#6b7280;font-size:13px">If you didn't request this, you can safely ignore it — your email won't change.</p>`
    );

    res.json({ message: `Verification email sent to ${new_email}. Click the link to confirm the change.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not initiate email change' });
  }
});

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What was the name of the street you grew up on?",
  "What is your mother's maiden name?",
  "What was the name of your primary school?",
  "What was the make and model of your first car?",
  "What city were you born in?",
  "What is the name of your oldest sibling?",
  "What was the name of your childhood best friend?",
];

/**
 * @swagger
 * /api/users/security-question:
 *   post:
 *     summary: Set security question and answer
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question, answer]
 *             properties:
 *               question:
 *                 type: string
 *               answer:
 *                 type: string
 *     responses:
 *       200:
 *         description: Security question saved
 *       400:
 *         description: Invalid question or answer
 */
app.post('/api/users/security-question', authenticateToken, async (req, res) => {
  const { question, answer } = req.body;
  const userId = req.user.userId;

  if (!question || !answer) {
    return res.status(400).json({ error: 'question and answer are required' });
  }
  if (!SECURITY_QUESTIONS.includes(question)) {
    return res.status(400).json({ error: 'Invalid security question' });
  }
  if (answer.trim().length < 2) {
    return res.status(400).json({ error: 'Answer must be at least 2 characters' });
  }

  try {
    const answerHash = await bcrypt.hash(answer.toLowerCase().trim(), 12);
    const existing = await pool.query('SELECT id FROM user_profiles WHERE user_id = $1', [userId]);
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO user_profiles (user_id, security_question, security_answer_hash) VALUES ($1, $2, $3)',
        [userId, question, answerHash]
      );
    } else {
      await pool.query(
        'UPDATE user_profiles SET security_question = $1, security_answer_hash = $2 WHERE user_id = $3',
        [question, answerHash, userId]
      );
    }
    res.json({ message: 'Security question saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save security question' });
  }
});

/**
 * @swagger
 * /api/users/security-question/{email}:
 *   get:
 *     summary: Get security question for an email (unauthenticated)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Security question returned
 *       404:
 *         description: User not found or no security question set
 */
app.get('/api/users/security-question/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query(
      `SELECT up.security_question
       FROM users u
       JOIN user_profiles up ON up.user_id = u.id
       WHERE u.email_hash = $1`,
      [emailHmac(email)]
    );
    if (result.rows.length === 0 || !result.rows[0].security_question) {
      return res.status(404).json({ error: 'No security question set for this account' });
    }
    res.json({ security_question: result.rows[0].security_question });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not retrieve security question' });
  }
});

/**
 * @swagger
 * /api/users/verify-security-question:
 *   post:
 *     summary: Verify security answer and get a password reset token (unauthenticated)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, answer]
 *             properties:
 *               email:
 *                 type: string
 *               answer:
 *                 type: string
 *     responses:
 *       200:
 *         description: Answer correct — reset token returned
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Incorrect answer
 *       404:
 *         description: User or security question not found
 */
app.post('/api/users/verify-security-question', async (req, res) => {
  const { email, answer } = req.body;
  if (!email || !answer) {
    return res.status(400).json({ error: 'email and answer are required' });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, up.security_answer_hash
       FROM users u
       JOIN user_profiles up ON up.user_id = u.id
       WHERE u.email_hash = $1`,
      [emailHmac(email)]
    );
    if (result.rows.length === 0 || !result.rows[0].security_answer_hash) {
      return res.status(404).json({ error: 'No security question set for this account' });
    }

    const valid = await bcrypt.compare(answer.toLowerCase().trim(), result.rows[0].security_answer_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect answer' });
    }

    // Generate a short-lived reset token (same mechanism as email reset)
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
      [result.rows[0].id, resetCode]
    );

    await sendEmail(
      email,
      'Your Wealth Manager password reset code',
      `<h2>Password Reset</h2>
       <p>Your identity was verified via your security question. Your 6-digit reset code is:</p>
       <h1 style="letter-spacing:8px;font-size:36px;">${resetCode}</h1>
       <p>This code expires in 15 minutes. If you didn't request a reset, you can ignore this email.</p>`
    );

    res.json({ message: 'If verified, a reset code has been sent to your email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify answer' });
  }
});

// ── Account deletion ─────────────────────────────────────────────────────────

app.delete('/api/users/me', authenticateToken, async (req, res) => {
  const { password } = req.body;
  const userId = req.user.userId;

  if (!password) {
    return res.status(400).json({ error: 'Password is required to confirm account deletion' });
  }

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const valid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    // Delete user — CASCADE removes user_profiles, nominees (owned), password_reset_tokens
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    // Publish event so other services clean up their data
    await publishEvent('user.deleted', { userId });

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete account' });
  }
});

// ────────────────────────────────────────────────────────────────────────────

// ── Email verification endpoints ─────────────────────────────────────────────

app.get('/api/users/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send('<h2>Invalid verification link.</h2>');
  }

  try {
    const result = await pool.query(
      `SELECT id, email_verified, pending_email FROM users
       WHERE verification_token = $1 AND token_expiry > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2 style="color:#dc2626">Verification link invalid or expired</h2>
          <p>Please request a new verification email from the app.</p>
        </body></html>`);
    }

    const user = result.rows[0];

    if (user.pending_email) {
      // Email change verification — swap in the new address and update hash
      await pool.query(
        `UPDATE users SET email = pending_email, email_hash = pending_email_hash,
         pending_email = NULL, pending_email_hash = NULL,
         verification_token = NULL, token_expiry = NULL WHERE id = $1`,
        [user.id]
      );
      return res.send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2 style="color:#16a34a">&#10003; Email address updated!</h2>
          <p>Your email has been changed. Log in with your new address.</p>
        </body></html>`);
    }

    // Initial registration verification
    await pool.query(
      `UPDATE users SET email_verified = true, verification_token = NULL, token_expiry = NULL WHERE id = $1`,
      [user.id]
    );

    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#16a34a">&#10003; Email verified!</h2>
        <p>Your account is now active. You can log in to Wealth Manager.</p>
      </body></html>`);
  } catch (err) {
    console.error(err);
    res.status(500).send('<h2>Something went wrong. Please try again.</h2>');
  }
});

app.post('/api/users/resend-verification', resendVerificationLimiter, async (req, res) => {
  const { email } = req.body;
  const GENERIC = { message: 'If that account exists and is unverified, a new email has been sent.' };

  if (!email) return res.json(GENERIC);

  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE email_hash = $1 AND email_verified = false',
      [emailHmac(email)]
    );

    if (result.rows.length === 0) return res.json(GENERIC);

    const userId = result.rows[0].id;
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET verification_token = $1, token_expiry = $2 WHERE id = $3',
      [verificationToken, tokenExpiry, userId]
    );

    const verifyUrl = `${process.env.APP_URL}/api/users/verify-email?token=${verificationToken}`;
    await sendEmail(
      email,
      'Verify your Wealth Manager account',
      `<h2>Verify your email</h2>
       <p>Click the button below to verify your email address. The link expires in 24 hours.</p>
       <p style="margin:24px 0">
         <a href="${verifyUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
           Verify my email
         </a>
       </p>
       <p style="color:#6b7280;font-size:13px">Or copy this link:<br>${verifyUrl}</p>`
    );

    res.json(GENERIC);
  } catch (err) {
    console.error(err);
    res.json(GENERIC);
  }
});

// ────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'user-service' });
});

// Start server
const PORT = process.env.PORT || 3001;

async function start() {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set');
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('FATAL: RESEND_API_KEY environment variable is not set');
    process.exit(1);
  }
  if (!process.env.FROM_EMAIL) {
    console.error('FATAL: FROM_EMAIL environment variable is not set');
    process.exit(1);
  }
  if (!process.env.APP_URL) {
    console.error('FATAL: APP_URL environment variable is not set');
    process.exit(1);
  }
  await initDB();
  await connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`User Service running on port ${PORT}`);
  });
}

module.exports = app;

if (require.main === module) {
  start();
}
