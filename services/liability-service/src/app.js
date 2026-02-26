// services/liability-service/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const amqp = require('amqplib');
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
    info: { title: 'Liability Service API', version: '1.0.0', description: 'Track short-term and long-term liabilities' },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
    }
  },
  apis: ['./src/app.js']
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-liability',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'liabilitydb',
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

    // Subscribe to user events
    const queue = await channel.assertQueue('liability_service_queue', { durable: true });
    await channel.bindQueue(queue.queue, EXCHANGE_NAME, 'user.#');

    channel.consume(queue.queue, async (msg) => {
      if (msg) {
        const event = JSON.parse(msg.content.toString());
        console.log('Received event:', event.eventType);

        if (event.eventType === 'user.registered') {
          console.log(`User ${event.data.userId} registered - ready to track liabilities`);
        }

        channel.ack(msg);
      }
    });

    console.log('Connected to RabbitMQ and subscribed to user events');
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
      CREATE TABLE IF NOT EXISTS liabilities (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        liability_type VARCHAR(50) NOT NULL, -- 'short_term', 'long_term'
        name VARCHAR(255) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        interest_rate DECIMAL(5, 2),
        due_date DATE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_liabilities_user_id ON liabilities(user_id);
      CREATE INDEX IF NOT EXISTS idx_liabilities_type ON liabilities(liability_type);
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
 * /api/liabilities/short-term:
 *   post:
 *     summary: Add a short-term liability
 *     tags: [Liabilities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, amount]
 *             properties:
 *               name:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *               interest_rate:
 *                 type: number
 *               due_date:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Short-term liability created
 *       401:
 *         description: Unauthorized
 */
app.post('/api/liabilities/short-term', authenticateToken, async (req, res) => {
  const { name, amount, currency, interest_rate, due_date, description } = req.body;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `INSERT INTO liabilities (user_id, liability_type, name, amount, currency, interest_rate, due_date, description)
       VALUES ($1, 'short_term', $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, name, amount, currency || 'USD', interest_rate, due_date, description]
    );

    const liability = result.rows[0];

    // Publish ShortTermLiabilityAdded event
    await publishEvent('liability.short_term.added', { userId, liability });

    res.status(201).json({ liability });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add short-term liability' });
  }
});

/**
 * @swagger
 * /api/liabilities/long-term:
 *   post:
 *     summary: Add a long-term liability
 *     tags: [Liabilities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, amount]
 *             properties:
 *               name:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *               interest_rate:
 *                 type: number
 *               due_date:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Long-term liability created
 *       401:
 *         description: Unauthorized
 */
app.post('/api/liabilities/long-term', authenticateToken, async (req, res) => {
  const { name, amount, currency, interest_rate, due_date, description } = req.body;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `INSERT INTO liabilities (user_id, liability_type, name, amount, currency, interest_rate, due_date, description)
       VALUES ($1, 'long_term', $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, name, amount, currency || 'USD', interest_rate, due_date, description]
    );

    const liability = result.rows[0];

    // Publish LongTermLiabilityAdded event
    await publishEvent('liability.long_term.added', { userId, liability });

    res.status(201).json({ liability });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add long-term liability' });
  }
});

/**
 * @swagger
 * /api/liabilities/{id}:
 *   put:
 *     summary: Update a liability
 *     tags: [Liabilities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *               interest_rate:
 *                 type: number
 *               due_date:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Liability updated
 *       404:
 *         description: Liability not found
 */
app.put('/api/liabilities/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, amount, currency, interest_rate, due_date, description } = req.body;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `UPDATE liabilities
       SET name = COALESCE($1, name),
           amount = COALESCE($2, amount),
           currency = COALESCE($3, currency),
           interest_rate = COALESCE($4, interest_rate),
           due_date = COALESCE($5, due_date),
           description = COALESCE($6, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [name, amount, currency, interest_rate, due_date, description, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Liability not found' });
    }

    const liability = result.rows[0];

    // Publish LiabilityUpdated event
    await publishEvent('liability.updated', { userId, liability });

    res.json({ liability });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update liability' });
  }
});

/**
 * @swagger
 * /api/liabilities:
 *   get:
 *     summary: Get all liabilities for the authenticated user
 *     tags: [Liabilities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [short_term, long_term]
 *         description: Filter by liability type
 *     responses:
 *       200:
 *         description: List of liabilities
 */
app.get('/api/liabilities', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { type } = req.query;

  try {
    let query = 'SELECT * FROM liabilities WHERE user_id = $1';
    const params = [userId];

    if (type) {
      query += ' AND liability_type = $2';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.json({ liabilities: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve liabilities' });
  }
});

/**
 * @swagger
 * /api/liabilities/total/amount:
 *   get:
 *     summary: Get the total amount of all liabilities
 *     tags: [Liabilities]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total liabilities amount
 */
app.get('/api/liabilities/total/amount', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      'SELECT SUM(amount) as total_amount FROM liabilities WHERE user_id = $1',
      [userId]
    );

    res.json({ totalAmount: result.rows[0].total_amount || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate total amount' });
  }
});

/**
 * @swagger
 * /api/liabilities/{id}:
 *   get:
 *     summary: Get a liability by ID
 *     tags: [Liabilities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Liability details
 *       404:
 *         description: Liability not found
 */
app.get('/api/liabilities/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      'SELECT * FROM liabilities WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Liability not found' });
    }

    res.json({ liability: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve liability' });
  }
});

/**
 * @swagger
 * /api/liabilities/{id}:
 *   delete:
 *     summary: Delete a liability
 *     tags: [Liabilities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Liability deleted
 *       404:
 *         description: Liability not found
 */
app.delete('/api/liabilities/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      'DELETE FROM liabilities WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Liability not found' });
    }

    // Publish LiabilityDeleted event
    await publishEvent('liability.deleted', { userId, liabilityId: id });

    res.json({ message: 'Liability deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete liability' });
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
  res.json({ status: 'healthy', service: 'liability-service' });
});

// Start server
const PORT = process.env.PORT || 3003;

async function start() {
  await initDB();
  await connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`Liability Service running on port ${PORT}`);
  });
}

module.exports = app;

if (require.main === module) {
  start();
}
