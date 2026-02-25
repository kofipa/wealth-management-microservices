// services/asset-service/src/app.js
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-asset',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'assetdb',
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
    const queue = await channel.assertQueue('asset_service_queue', { durable: true });
    await channel.bindQueue(queue.queue, EXCHANGE_NAME, 'user.#');

    channel.consume(queue.queue, async (msg) => {
      if (msg) {
        const event = JSON.parse(msg.content.toString());
        console.log('Received event:', event.eventType);

        // Handle user.registered event - could initialize default asset records
        if (event.eventType === 'user.registered') {
          console.log(`User ${event.data.userId} registered - ready to track assets`);
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
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        asset_type VARCHAR(50) NOT NULL, -- 'cash', 'investment', 'property', 'other'
        name VARCHAR(255) NOT NULL,
        value DECIMAL(15, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
      CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
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

// Add Cash Asset
app.post('/api/assets/cash', authenticateToken, async (req, res) => {
  const { name, value, currency, description } = req.body;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `INSERT INTO assets (user_id, asset_type, name, value, currency, description)
       VALUES ($1, 'cash', $2, $3, $4, $5) RETURNING *`,
      [userId, name, value, currency || 'USD', description]
    );

    const asset = result.rows[0];

    // Publish CashAssetAdded event
    await publishEvent('asset.cash.added', { userId, asset });

    res.status(201).json({ asset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add cash asset' });
  }
});

// Add Investment Asset
app.post('/api/assets/investment', authenticateToken, async (req, res) => {
  const { name, value, currency, description } = req.body;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `INSERT INTO assets (user_id, asset_type, name, value, currency, description)
       VALUES ($1, 'investment', $2, $3, $4, $5) RETURNING *`,
      [userId, name, value, currency || 'USD', description]
    );

    const asset = result.rows[0];

    // Publish InvestmentAssetAdded event
    await publishEvent('asset.investment.added', { userId, asset });

    res.status(201).json({ asset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add investment asset' });
  }
});

// Add Property Asset
app.post('/api/assets/property', authenticateToken, async (req, res) => {
  const { name, value, currency, description } = req.body;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `INSERT INTO assets (user_id, asset_type, name, value, currency, description)
       VALUES ($1, 'property', $2, $3, $4, $5) RETURNING *`,
      [userId, name, value, currency || 'USD', description]
    );

    const asset = result.rows[0];

    // Publish PropertyAssetAdded event
    await publishEvent('asset.property.added', { userId, asset });

    res.status(201).json({ asset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add property asset' });
  }
});

// Add Other Asset
app.post('/api/assets/other', authenticateToken, async (req, res) => {
  const { name, value, currency, description } = req.body;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `INSERT INTO assets (user_id, asset_type, name, value, currency, description)
       VALUES ($1, 'other', $2, $3, $4, $5) RETURNING *`,
      [userId, name, value, currency || 'USD', description]
    );

    const asset = result.rows[0];

    // Publish OtherAssetAdded event
    await publishEvent('asset.other.added', { userId, asset });

    res.status(201).json({ asset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add other asset' });
  }
});

// Update Asset
app.put('/api/assets/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, value, currency, description } = req.body;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `UPDATE assets
       SET name = COALESCE($1, name),
           value = COALESCE($2, value),
           currency = COALESCE($3, currency),
           description = COALESCE($4, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [name, value, currency, description, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const asset = result.rows[0];

    // Publish AssetUpdated event
    await publishEvent('asset.updated', { userId, asset });

    res.json({ asset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// Get All User Assets
app.get('/api/assets', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { type } = req.query;

  try {
    let query = 'SELECT * FROM assets WHERE user_id = $1';
    const params = [userId];

    if (type) {
      query += ' AND asset_type = $2';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.json({ assets: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve assets' });
  }
});

// Get Asset by ID
app.get('/api/assets/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      'SELECT * FROM assets WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    res.json({ asset: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve asset' });
  }
});

// Delete Asset
app.delete('/api/assets/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      'DELETE FROM assets WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Publish AssetDeleted event
    await publishEvent('asset.deleted', { userId, assetId: id });

    res.json({ message: 'Asset deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// Get Total Assets Value (for Net Worth calculation)
app.get('/api/assets/total/value', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      'SELECT SUM(value) as total_value FROM assets WHERE user_id = $1',
      [userId]
    );

    res.json({ totalValue: result.rows[0].total_value || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to calculate total value' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'asset-service' });
});

// Start server
const PORT = process.env.PORT || 3002;

async function start() {
  await initDB();
  await connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`Asset Service running on port ${PORT}`);
  });
}

start();
