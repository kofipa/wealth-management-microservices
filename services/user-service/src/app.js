// services/user-service/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const amqp = require('amqplib');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(cors());
app.use(express.json());

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
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-user',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'userdb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

// RabbitMQ connection
let channel;
const EXCHANGE_NAME = 'wealth_management_events';

async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672');
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

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
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
app.post('/api/users/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, passwordHash]
    );

    const user = result.rows[0];

    // Publish UserRegistered event
    await publishEvent('user.registered', { userId: user.id, email: user.email });

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: user.id, email: user.email }
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
app.post('/api/users/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Record last login and auto-link any pending nominations for this email
    try {
      await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
      await pool.query(
        `UPDATE nominees SET nominee_user_id = $1, status = 'accepted'
         WHERE nominee_email = $2 AND nominee_user_id IS NULL`,
        [user.id, user.email]
      );
    } catch (e) {
      console.error('Post-login update error (non-fatal):', e.message);
    }

    // Publish UserLoggedIn event
    await publishEvent('user.logged_in', { userId: user.id, email: user.email });

    res.json({ token, userId: user.id, email: user.email });
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
      // Insert new profile
      result = await pool.query(
        `INSERT INTO user_profiles (user_id, first_name, last_name, phone, date_of_birth, address)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, first_name, last_name, phone, date_of_birth, address]
      );

      // Publish UserProfileAdded event
      await publishEvent('user.profile.added', { userId, profile: result.rows[0] });
    } else {
      // Update existing profile
      result = await pool.query(
        `UPDATE user_profiles
         SET first_name = $1, last_name = $2, phone = $3, date_of_birth = $4, address = $5, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $6 RETURNING *`,
        [first_name, last_name, phone, date_of_birth, address, userId]
      );

      // Publish UserProfileUpdated event
      await publishEvent('user.profile.updated', { userId, profile: result.rows[0] });
    }

    res.json({ profile: result.rows[0] });
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
      `SELECT u.id, u.email, p.first_name, p.last_name, p.phone, p.date_of_birth, p.address
       FROM users u
       LEFT JOIN user_profiles p ON u.id = p.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ profile: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// --- Nominee / Trusted Contacts Routes ---

app.post('/api/users/nominees', authenticateToken, async (req, res) => {
  const { email, inactivity_days } = req.body;
  const ownerId = req.user.userId;

  if (!email || !inactivity_days) {
    return res.status(400).json({ error: 'email and inactivity_days are required' });
  }
  if (email === req.user.email) {
    return res.status(400).json({ error: 'You cannot nominate yourself' });
  }

  try {
    // Check if nominee already has an account
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
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

app.get('/api/users/delegated-accounts', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.owner_id, u.email AS owner_email, n.inactivity_days, u.last_login_at
       FROM nominees n
       JOIN users u ON u.id = n.owner_id
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
      return {
        owner_id: row.owner_id,
        owner_email: row.owner_email,
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
      `SELECT n.inactivity_days, u.email AS owner_email, u.last_login_at
       FROM nominees n
       JOIN users u ON u.id = n.owner_id
       WHERE n.owner_id = $1 AND n.nominee_user_id = $2 AND n.status = 'accepted'`,
      [ownerId, nomineeId]
    );

    if (nomineeCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorised as nominee for this account' });
    }

    const { inactivity_days, owner_email, last_login_at } = nomineeCheck.rows[0];
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
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '8h' }
    );

    res.json({ token, owner_email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not issue delegated token' });
  }
});

// --- Forgot / Reset Password Routes ---

app.post('/api/users/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    // Always return success to avoid leaking whether the email exists
    if (userResult.rows.length === 0) {
      return res.json({ message: 'Reset code generated', devCode: null });
    }

    const userId = userResult.rows[0].id;
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
      [userId, code]
    );

    console.log(`Reset code for ${email}: ${code}`);
    res.json({ message: 'Reset code generated', devCode: code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate reset code' });
  }
});

app.post('/api/users/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body;

  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'email, token and newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const result = await pool.query(
      `SELECT prt.id FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token = $1
         AND prt.used = FALSE
         AND prt.expires_at > NOW()
         AND u.email = $2`,
      [token, email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    const tokenId = result.rows[0].id;
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [passwordHash, email]
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
