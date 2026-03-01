// services/networth-service/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { Pool } = require('pg');

const helmet = require('helmet');
const PDFDocument = require('pdfkit');

const app = express();
app.use(helmet());
app.use(cors({
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Swagger setup
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Net Worth Service API', version: '1.0.0', description: 'Calculate net worth by aggregating assets and liabilities' },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
    }
  },
  apis: ['./src/app.js']
});
app.use('/api-docs', authenticateToken, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Service URLs
const ASSET_SERVICE_URL = process.env.ASSET_SERVICE_URL || 'http://asset-service:3002';
const LIABILITY_SERVICE_URL = process.env.LIABILITY_SERVICE_URL || 'http://liability-service:3003';

// Database connection for history snapshots
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'networthdb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres123',
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS networth_snapshots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        net_worth NUMERIC(15,2) NOT NULL,
        total_assets NUMERIC(15,2) NOT NULL,
        total_liabilities NUMERIC(15,2) NOT NULL,
        snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, snapshot_date)
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON networth_snapshots(user_id, snapshot_date);
    `);
    console.log('NetWorth DB initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
  } finally {
    client.release();
  }
}

// RabbitMQ connection
let channel;
const EXCHANGE_NAME = 'wealth_management_events';

async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672');
    channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

    // Subscribe to asset and liability events
    const queue = await channel.assertQueue('networth_service_queue', { durable: true });
    await channel.bindQueue(queue.queue, EXCHANGE_NAME, 'asset.#');
    await channel.bindQueue(queue.queue, EXCHANGE_NAME, 'liability.#');

    channel.consume(queue.queue, async (msg) => {
      if (msg) {
        const event = JSON.parse(msg.content.toString());
        console.log('Received event:', event.eventType);

        // When assets or liabilities change, we could trigger net worth recalculation
        if (event.eventType.startsWith('asset.') || event.eventType.startsWith('liability.')) {
          console.log(`Financial data changed for user ${event.data.userId}`);
          // Could implement automatic net worth calculation trigger here
        }

        channel.ack(msg);
      }
    });

    console.log('Connected to RabbitMQ and subscribed to asset/liability events');
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

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Routes

/**
 * @swagger
 * /api/networth/calculate:
 *   get:
 *     summary: Calculate total net worth (assets minus liabilities)
 *     tags: [Net Worth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Net worth calculation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: integer
 *                 totalAssets:
 *                   type: number
 *                 totalLiabilities:
 *                   type: number
 *                 netWorth:
 *                   type: number
 *                 calculatedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 */
app.get('/api/networth/calculate', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const token = req.headers['authorization'];

  try {
    // Fetch total assets from Asset Service
    const assetsResponse = await axios.get(
      `${ASSET_SERVICE_URL}/api/assets/total/value`,
      { headers: { Authorization: token } }
    );
    const totalAssets = parseFloat(assetsResponse.data.totalValue) || 0;

    // Fetch total liabilities from Liability Service
    const liabilitiesResponse = await axios.get(
      `${LIABILITY_SERVICE_URL}/api/liabilities/total/amount`,
      { headers: { Authorization: token } }
    );
    const totalLiabilities = parseFloat(liabilitiesResponse.data.totalAmount) || 0;

    // Calculate net worth
    const netWorth = totalAssets - totalLiabilities;

    const result = {
      userId,
      totalAssets,
      totalLiabilities,
      netWorth,
      calculatedAt: new Date()
    };

    // Upsert daily snapshot
    try {
      await pool.query(
        `INSERT INTO networth_snapshots (user_id, net_worth, total_assets, total_liabilities, snapshot_date)
         VALUES ($1, $2, $3, $4, CURRENT_DATE)
         ON CONFLICT (user_id, snapshot_date)
         DO UPDATE SET net_worth = $2, total_assets = $3, total_liabilities = $4`,
        [userId, netWorth, totalAssets, totalLiabilities]
      );
    } catch (dbErr) {
      console.error('Snapshot upsert error:', dbErr.message);
    }

    // Publish NetWorthCalculated event
    await publishEvent('networth.calculated', result);

    res.json(result);
  } catch (err) {
    // Propagate auth failures from downstream services so the client can re-login
    const downstream = err.response?.status;
    if (downstream === 401 || downstream === 403) {
      return res.status(downstream).json({ error: err.response.data?.error || 'Unauthorized' });
    }
    console.error('Error calculating net worth:', err.message);
    res.status(500).json({ error: 'Failed to calculate net worth' });
  }
});

/**
 * @swagger
 * /api/networth/breakdown:
 *   get:
 *     summary: Get a detailed net worth breakdown by asset and liability type
 *     tags: [Net Worth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Detailed net worth breakdown
 *       401:
 *         description: Unauthorized
 */
app.get('/api/networth/breakdown', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const token = req.headers['authorization'];

  try {
    // Fetch all assets
    const assetsResponse = await axios.get(
      `${ASSET_SERVICE_URL}/api/assets`,
      { headers: { Authorization: token } }
    );
    const assets = assetsResponse.data.assets || [];

    // Fetch all liabilities
    const liabilitiesResponse = await axios.get(
      `${LIABILITY_SERVICE_URL}/api/liabilities`,
      { headers: { Authorization: token } }
    );
    const liabilities = liabilitiesResponse.data.liabilities || [];

    // Calculate totals by type
    const assetsByType = assets.reduce((acc, asset) => {
      acc[asset.asset_type] = (acc[asset.asset_type] || 0) + parseFloat(asset.value);
      return acc;
    }, {});

    const liabilitiesByType = liabilities.reduce((acc, liability) => {
      acc[liability.liability_type] = (acc[liability.liability_type] || 0) + parseFloat(liability.amount);
      return acc;
    }, {});

    const totalAssets = assets.reduce((sum, asset) => sum + parseFloat(asset.value), 0);
    const totalLiabilities = liabilities.reduce((sum, liability) => sum + parseFloat(liability.amount), 0);
    const netWorth = totalAssets - totalLiabilities;

    res.json({
      userId,
      netWorth,
      totalAssets,
      totalLiabilities,
      assetsByType,
      liabilitiesByType,
      assetCount: assets.length,
      liabilityCount: liabilities.length,
      calculatedAt: new Date()
    });
  } catch (err) {
    // Propagate auth failures from downstream services so the client can re-login
    const downstream = err.response?.status;
    if (downstream === 401 || downstream === 403) {
      return res.status(downstream).json({ error: err.response.data?.error || 'Unauthorized' });
    }
    console.error('Error getting net worth breakdown:', err.message);
    res.status(500).json({ error: 'Failed to get net worth breakdown' });
  }
});

/**
 * @swagger
 * /api/networth/history:
 *   get:
 *     summary: Get net worth history snapshots
 *     tags: [Net Worth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Array of daily net worth snapshots ordered by date ASC
 */
app.get('/api/networth/history', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const days = parseInt(req.query.days) || 30;

  try {
    const result = await pool.query(
      `SELECT snapshot_date AS date,
              net_worth, total_assets, total_liabilities
       FROM networth_snapshots
       WHERE user_id = $1
         AND snapshot_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
       ORDER BY snapshot_date ASC`,
      [userId, days]
    );
    res.json({ history: result.rows });
  } catch (err) {
    console.error('Error fetching history:', err.message);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * @swagger
 * /api/networth/export/pdf:
 *   get:
 *     summary: Export net worth summary as a PDF
 *     tags: [Net Worth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
app.get('/api/networth/export/pdf', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const token = req.headers['authorization'];

  try {
    // Fetch breakdown + history in parallel
    const [breakdownResp, historyResp] = await Promise.all([
      axios.get(`http://localhost:${process.env.PORT || 3004}/api/networth/breakdown`, { headers: { Authorization: token } }),
      pool.query(
        `SELECT snapshot_date AS date, net_worth, total_assets, total_liabilities
         FROM networth_snapshots
         WHERE user_id = $1 AND snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
         ORDER BY snapshot_date ASC`,
        [userId]
      ),
    ]);

    const data = breakdownResp.data;
    const history = historyResp.rows;

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="networth-report.pdf"');
    doc.pipe(res);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('Net Worth Report', { align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#555')
      .text(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, { align: 'center' });
    doc.moveDown(1.5);

    // Net worth summary box
    const nw = parseFloat(data.netWorth || 0);
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#000').text('Summary');
    doc.moveDown(0.3);
    const fmt = (v) => `£${parseFloat(v || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    doc.font('Helvetica').fontSize(11)
      .text(`Net Worth:          ${fmt(data.netWorth)}`)
      .text(`Total Assets:       ${fmt(data.totalAssets)}`)
      .text(`Total Liabilities:  ${fmt(data.totalLiabilities)}`);
    doc.moveDown(1);

    // Assets by type
    if (data.assetsByType && Object.keys(data.assetsByType).length > 0) {
      doc.fontSize(13).font('Helvetica-Bold').text('Assets by Type');
      doc.moveDown(0.3);
      for (const [type, value] of Object.entries(data.assetsByType)) {
        doc.font('Helvetica').fontSize(11)
          .text(`  ${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}: ${fmt(value)}`);
      }
      doc.moveDown(1);
    }

    // Liabilities by type
    if (data.liabilitiesByType && Object.keys(data.liabilitiesByType).length > 0) {
      doc.fontSize(13).font('Helvetica-Bold').text('Liabilities by Type');
      doc.moveDown(0.3);
      for (const [type, value] of Object.entries(data.liabilitiesByType)) {
        doc.font('Helvetica').fontSize(11)
          .text(`  ${type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${fmt(value)}`);
      }
      doc.moveDown(1);
    }

    // 30-day history
    if (history.length > 0) {
      doc.fontSize(13).font('Helvetica-Bold').text('30-Day History');
      doc.moveDown(0.3);
      for (const row of history) {
        const dateStr = new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        doc.font('Helvetica').fontSize(10)
          .text(`  ${dateStr}  —  Net Worth: ${fmt(row.net_worth)}  (Assets: ${fmt(row.total_assets)}, Liabilities: ${fmt(row.total_liabilities)})`);
      }
      doc.moveDown(1);

      // Trend summary
      if (history.length >= 2) {
        const first = parseFloat(history[0].net_worth);
        const last = parseFloat(history[history.length - 1].net_worth);
        const delta = last - first;
        const sign = delta >= 0 ? '+' : '';
        doc.fontSize(11).font('Helvetica-Bold')
          .text(`Trend over last ${history.length} snapshots: ${sign}${fmt(delta)}`);
      }
    }

    doc.end();
  } catch (err) {
    const downstream = err.response?.status;
    if (downstream === 401 || downstream === 403) {
      return res.status(downstream).json({ error: 'Unauthorized' });
    }
    console.error('PDF export error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate PDF' });
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
  res.json({ status: 'healthy', service: 'networth-service' });
});

// Start server
const PORT = process.env.PORT || 3004;

async function start() {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set');
    process.exit(1);
  }
  await initDB();
  await connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`Net Worth Service running on port ${PORT}`);
  });
}

module.exports = app;

if (require.main === module) {
  start();
}
