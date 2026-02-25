// services/networth-service/src/app.js
const express = require('express');
const cors = require('cors');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Service URLs
const ASSET_SERVICE_URL = process.env.ASSET_SERVICE_URL || 'http://asset-service:3002';
const LIABILITY_SERVICE_URL = process.env.LIABILITY_SERVICE_URL || 'http://liability-service:3003';

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

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Routes

// Calculate Total Net Worth
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

    // Publish NetWorthCalculated event
    await publishEvent('networth.calculated', result);

    res.json(result);
  } catch (err) {
    console.error('Error calculating net worth:', err.message);
    res.status(500).json({ error: 'Failed to calculate net worth' });
  }
});

// Get Detailed Net Worth Breakdown
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
    console.error('Error getting net worth breakdown:', err.message);
    res.status(500).json({ error: 'Failed to get net worth breakdown' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'networth-service' });
});

// Start server
const PORT = process.env.PORT || 3004;

async function start() {
  await connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`Net Worth Service running on port ${PORT}`);
  });
}

start();
