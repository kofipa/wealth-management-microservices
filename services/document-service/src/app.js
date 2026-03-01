// services/document-service/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const helmet = require('helmet');
const path = require('path');

const app = express();
app.use(helmet());
const _corsOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : true;
app.use(cors({
  origin: _corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Swagger setup
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Document Service API', version: '1.0.0', description: 'Upload and manage supporting documents' },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
    }
  },
  apis: ['./src/app.js']
});
app.use('/api-docs', authenticateToken, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Configure multer for file uploads (in-memory storage for simplicity)
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Accepted types: PDF, images, Word, Excel, text.`), false);
    }
  },
});

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-document',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'documentdb',
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

    // Subscribe to asset and liability events to link documents
    const queue = await channel.assertQueue('document_service_queue', { durable: true });
    await channel.bindQueue(queue.queue, EXCHANGE_NAME, 'asset.#');
    await channel.bindQueue(queue.queue, EXCHANGE_NAME, 'liability.#');
    await channel.bindQueue(queue.queue, EXCHANGE_NAME, 'user.#');

    channel.consume(queue.queue, async (msg) => {
      if (msg) {
        const event = JSON.parse(msg.content.toString());
        console.log('Received event:', event.eventType);

        if (event.eventType === 'user.deleted') {
          await pool.query('DELETE FROM documents WHERE user_id = $1', [event.data.userId]);
          console.log(`Deleted documents for user ${event.data.userId}`);
        }

        channel.ack(msg);
      }
    });

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
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        file_size INTEGER,
        file_data BYTEA,
        related_entity_type VARCHAR(50), -- 'asset', 'liability', 'general'
        related_entity_id INTEGER,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(related_entity_type, related_entity_id);
    `);
    await client.query(`
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'other';
    `);
    await client.query(`
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS expiry_date DATE;
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

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Routes

/**
 * @swagger
 * /api/documents/upload:
 *   post:
 *     summary: Upload a document
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               related_entity_type:
 *                 type: string
 *                 enum: [asset, liability, general]
 *               related_entity_id:
 *                 type: integer
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Document uploaded
 *       400:
 *         description: No file uploaded
 *       401:
 *         description: Unauthorized
 */
app.post('/api/documents/upload', authenticateToken, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { related_entity_type, related_entity_id, description, category, expiry_date } = req.body;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      `INSERT INTO documents (user_id, filename, original_name, mime_type, file_size, file_data,
       related_entity_type, related_entity_id, description, category, expiry_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, filename, original_name, mime_type,
       file_size, related_entity_type, related_entity_id, description, category, expiry_date, created_at`,
      [
        userId,
        `${Date.now()}_${path.basename(req.file.originalname)}`,
        path.basename(req.file.originalname),
        req.file.mimetype,
        req.file.size,
        req.file.buffer,
        related_entity_type || 'general',
        related_entity_id || null,
        description,
        category || 'other',
        expiry_date || null,
      ]
    );

    const document = result.rows[0];

    // Publish DocumentAdded event
    await publishEvent('document.added', { userId, document });

    res.status(201).json({ document });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

/**
 * @swagger
 * /api/documents:
 *   get:
 *     summary: Get all documents for the authenticated user
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entity_type
 *         schema:
 *           type: string
 *           enum: [asset, liability, general]
 *       - in: query
 *         name: entity_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of documents
 */
app.get('/api/documents', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { entity_type, entity_id, category } = req.query;

  const { expiring_soon } = req.query;

  try {
    let query = `SELECT id, filename, original_name, mime_type, file_size,
                 related_entity_type, related_entity_id, description, category, expiry_date, created_at
                 FROM documents WHERE user_id = $1`;
    const params = [userId];

    if (entity_type) {
      params.push(entity_type);
      query += ` AND related_entity_type = $${params.length}`;

      if (entity_id) {
        params.push(entity_id);
        query += ` AND related_entity_id = $${params.length}`;
      }
    }

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (expiring_soon === 'true') {
      query += ` AND expiry_date IS NOT NULL AND expiry_date <= (NOW() + INTERVAL '30 days')`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.json({ documents: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve documents' });
  }
});

/**
 * @swagger
 * /api/documents/{id}/download:
 *   get:
 *     summary: Download a document
 *     tags: [Documents]
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
 *         description: File download
 *       404:
 *         description: Document not found
 */
app.get('/api/documents/:id/download', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = result.rows[0];

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.original_name)}"`,
      'Content-Length': document.file_size,
      'X-Content-Type-Options': 'nosniff',
    });

    res.send(document.file_data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

/**
 * @swagger
 * /api/documents/{id}:
 *   delete:
 *     summary: Delete a document
 *     tags: [Documents]
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
 *         description: Document deleted
 *       404:
 *         description: Document not found
 */
app.delete('/api/documents/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const result = await pool.query(
      'DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Publish DocumentDeleted event
    await publishEvent('document.deleted', { userId, documentId: id });

    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete document' });
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
  res.json({ status: 'healthy', service: 'document-service' });
});

// Start server
const PORT = process.env.PORT || 3005;

async function start() {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set');
    process.exit(1);
  }
  await initDB();
  await connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`Document Service running on port ${PORT}`);
  });
}

module.exports = app;

if (require.main === module) {
  start();
}
