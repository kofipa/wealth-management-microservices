// services/service-service/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(cors());
app.use(express.json());

// Swagger setup
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Service Service API', version: '1.0.0', description: 'Registry of all platform microservices' },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
    }
  },
  apis: ['./src/app.js']
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Service registry
const SERVICES = [
  {
    name: 'user-service',
    port: 3001,
    url: process.env.USER_SERVICE_URL || 'http://user-service:3001',
    description: 'User authentication and profile management'
  },
  {
    name: 'asset-service',
    port: 3002,
    url: process.env.ASSET_SERVICE_URL || 'http://asset-service:3002',
    description: 'Manage assets (cash, investments, property)'
  },
  {
    name: 'liability-service',
    port: 3003,
    url: process.env.LIABILITY_SERVICE_URL || 'http://liability-service:3003',
    description: 'Track short and long-term liabilities'
  },
  {
    name: 'networth-service',
    port: 3004,
    url: process.env.NETWORTH_SERVICE_URL || 'http://networth-service:3004',
    description: 'Calculate net worth from assets and liabilities'
  },
  {
    name: 'document-service',
    port: 3005,
    url: process.env.DOCUMENT_SERVICE_URL || 'http://document-service:3005',
    description: 'Upload and manage supporting documents'
  }
];

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
 * /api/services:
 *   get:
 *     summary: List all registered services
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of registered services
 *       401:
 *         description: Unauthorized
 */
app.get('/api/services', authenticateToken, (req, res) => {
  res.json({ services: SERVICES });
});

/**
 * @swagger
 * /api/services/health:
 *   get:
 *     summary: Check live health status of all registered services
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health status for each service
 *       401:
 *         description: Unauthorized
 */
app.get('/api/services/health', authenticateToken, async (req, res) => {
  const results = await Promise.all(
    SERVICES.map(async (service) => {
      try {
        await axios.get(`${service.url}/health`, { timeout: 3000 });
        return { ...service, status: 'up' };
      } catch {
        return { ...service, status: 'down' };
      }
    })
  );
  res.json({ services: results });
});

/**
 * @swagger
 * /api/services/{name}:
 *   get:
 *     summary: Get details and live health for a named service
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Service name (e.g. user-service)
 *     responses:
 *       200:
 *         description: Service details with live health status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Service not found
 */
app.get('/api/services/:name', authenticateToken, async (req, res) => {
  const service = SERVICES.find(s => s.name === req.params.name);

  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  try {
    await axios.get(`${service.url}/health`, { timeout: 3000 });
    res.json({ service: { ...service, status: 'up' } });
  } catch {
    res.json({ service: { ...service, status: 'down' } });
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
  res.json({ status: 'healthy', service: 'service-service' });
});

// Start server
const PORT = process.env.PORT || 3006;

async function start() {
  await connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`Service Service running on port ${PORT}`);
  });
}

module.exports = app;

if (require.main === module) {
  start();
}
