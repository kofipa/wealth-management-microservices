// services/asset-service/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// In-memory valuation cache (postcode → { data, timestamp })
const valuationCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// In-memory price cache (ticker → { data, timestamp })
const priceCache = new Map();
const PRICE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// In-memory vehicle cache (reg → { data, timestamp })
const vehicleCache = new Map();
const VEHICLE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const helmet = require('helmet');

const app = express();
app.use(helmet());
const _corsOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : true;
app.use(cors({
  origin: _corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-asset',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'assetdb',
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

        if (event.eventType === 'user.deleted') {
          await pool.query('DELETE FROM assets WHERE user_id = $1', [event.data.userId]);
          console.log(`Deleted assets for user ${event.data.userId}`);
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
    // Idempotent migrations
    await client.query(`ALTER TABLE assets ADD COLUMN IF NOT EXISTS metadata JSONB`);
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

// Shared validator for asset value
function validateAssetValue(value) {
  const n = parseFloat(value);
  if (value === undefined || value === null || value === '' || isNaN(n) || n < 0) {
    return 'value must be a non-negative number';
  }
  return null;
}

// Shared validator for string fields
function validateStringField(value, fieldName, { required = false, maxLength = 255 } = {}) {
  if (required && (!value || !String(value).trim())) return `${fieldName} is required`;
  if (value !== undefined && value !== null && String(value).trim().length > maxLength) {
    return `${fieldName} must be ${maxLength} characters or fewer`;
  }
  return null;
}

// Routes

// Add Cash Asset
app.post('/api/assets/cash', authenticateToken, async (req, res) => {
  const { name, value, currency, description } = req.body;
  const userId = req.user.userId;
  const valErr = validateAssetValue(value);
  const nameErr = validateStringField(name, 'name', { required: true });
  const descErr = validateStringField(description, 'description', { maxLength: 500 });
  if (nameErr || valErr || descErr) {
    return res.status(400).json({ error: nameErr || valErr || descErr });
  }

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
  const valErr = validateAssetValue(value);
  const nameErr = validateStringField(name, 'name', { required: true });
  const descErr = validateStringField(description, 'description', { maxLength: 500 });
  if (nameErr || valErr || descErr) return res.status(400).json({ error: nameErr || valErr || descErr });

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
  const valErr = validateAssetValue(value);
  const nameErr = validateStringField(name, 'name', { required: true });
  const descErr = validateStringField(description, 'description', { maxLength: 500 });
  if (nameErr || valErr || descErr) return res.status(400).json({ error: nameErr || valErr || descErr });

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
  const valErr = validateAssetValue(value);
  const nameErr = validateStringField(name, 'name', { required: true });
  const descErr = validateStringField(description, 'description', { maxLength: 500 });
  if (nameErr || valErr || descErr) return res.status(400).json({ error: nameErr || valErr || descErr });

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
  const { name, value, currency, description, metadata } = req.body;
  const userId = req.user.userId;

  const nameErr = validateStringField(name, 'name', { maxLength: 255 });
  const descErr = validateStringField(description, 'description', { maxLength: 500 });
  if (nameErr || descErr) return res.status(400).json({ error: nameErr || descErr });

  try {
    const result = await pool.query(
      `UPDATE assets
       SET name = COALESCE($1, name),
           value = COALESCE($2, value),
           currency = COALESCE($3, currency),
           description = COALESCE($4, description),
           metadata = CASE WHEN $5::jsonb IS NOT NULL THEN $5::jsonb ELSE metadata END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [name, value, currency, description, metadata !== undefined ? JSON.stringify(metadata) : null, id, userId]
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

const VALID_ASSET_TYPES = ['cash', 'investment', 'property', 'other'];

// Get All User Assets
app.get('/api/assets', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { type } = req.query;

  if (type && !VALID_ASSET_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid asset type' });
  }

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

// Vehicle valuation via DVLA + compound depreciation
app.get('/api/assets/valuation/vehicle', authenticateToken, async (req, res) => {
  const reg = (req.query.reg || '').trim().toUpperCase().replace(/\s/g, '');
  const purchasePrice = parseFloat(req.query.purchase_price);
  const purchaseDate = req.query.purchase_date;
  const rate = parseFloat(req.query.rate) || 0.15;

  if (!reg || isNaN(purchasePrice) || !purchaseDate) {
    return res.status(400).json({ error: 'reg, purchase_price and purchase_date required' });
  }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z]{3}$|^[A-Z][0-9]{1,3}[A-Z]{3}$|^[A-Z]{3}[0-9]{1,3}[A-Z]$/.test(reg)) {
    return res.status(400).json({ error: 'Invalid UK registration plate format' });
  }

  // Depreciation calculation (independent of DVLA)
  const years = (Date.now() - new Date(purchaseDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const floor = purchasePrice * 0.10;
  const estimated_value = Math.max(floor, purchasePrice * Math.pow(1 - rate, years));

  // DVLA lookup (optional — only runs if DVLA_API_KEY is configured)
  const cached = vehicleCache.get(reg);
  let vehicleDetails = cached && Date.now() - cached.timestamp < VEHICLE_CACHE_TTL ? cached.data : null;

  if (!vehicleDetails && process.env.DVLA_API_KEY) {
    try {
      const { data } = await axios.post(
        'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles',
        { registrationNumber: reg },
        {
          timeout: 6000,
          headers: {
            'x-api-key': process.env.DVLA_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }
      );
      vehicleDetails = {
        make: data.make,
        year_of_manufacture: data.yearOfManufacture,
        colour: data.colour,
        fuel_type: data.fuelType,
      };
      vehicleCache.set(reg, { data: vehicleDetails, timestamp: Date.now() });
    } catch (err) {
      console.error('DVLA lookup error:', err.message);
      // Non-fatal — return depreciation estimate without vehicle details
    }
  }

  res.json({
    reg,
    estimated_value: Math.round(estimated_value),
    years_depreciated: Math.round(years * 10) / 10,
    rate_used: rate,
    ...(vehicleDetails || {}),
  });
});

// Live fund/ETF price quote via Yahoo Finance (free, no API key)
app.get('/api/assets/price/quote', authenticateToken, async (req, res) => {
  const ticker = (req.query.ticker || '').trim().toUpperCase();
  if (!ticker) return res.status(400).json({ error: 'ticker required' });
  if (!/^[A-Z0-9]{1,6}(\.[A-Z]{1,2})?$/.test(ticker)) {
    return res.status(400).json({ error: 'Invalid ticker format' });
  }

  const cached = priceCache.get(ticker);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    });

    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return res.status(404).json({ error: 'Ticker not found' });

    const rawPrice = meta.regularMarketPrice;
    const currencyRaw = meta.currency || 'GBP';
    // UK LSE stocks quoted in GBp (pence) — convert to GBP
    const price_gbp = currencyRaw === 'GBp' ? rawPrice / 100 : rawPrice;

    const result = {
      ticker,
      name: meta.shortName || meta.longName || ticker,
      price_gbp,
      currency_raw: currencyRaw,
      exchange: meta.exchangeName || '',
      last_updated: new Date().toISOString(),
    };
    priceCache.set(ticker, { data: result, timestamp: Date.now() });
    res.json(result);
  } catch (err) {
    console.error('Price quote error:', err.message);
    res.status(502).json({ error: 'Price feed unavailable' });
  }
});

// Property valuation via HM Land Registry Price Paid Data (free, no API key)
app.get('/api/assets/valuation/property', authenticateToken, async (req, res) => {
  const raw = (req.query.postcode || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!raw) return res.status(400).json({ error: 'postcode required' });
  if (!/^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/.test(raw)) {
    return res.status(400).json({ error: 'Invalid postcode format' });
  }

  const cached = valuationCache.get(raw);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const encoded = encodeURIComponent(raw);
    const url = `https://landregistry.data.gov.uk/data/ppi/transaction-record.json`
      + `?propertyAddress.postcode=${encoded}&_pageSize=20&_sort=-transactionDate`;
    const { data } = await axios.get(url, { timeout: 8000 });
    const items = data?.result?.items || [];

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 24);
    const recent = items.filter(i => new Date(i.transactionDate) >= cutoff);

    const prices = recent.map(i => i.pricePaid).filter(Boolean).sort((a, b) => a - b);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;

    const result = {
      estimated_value: median,
      comparables_count: prices.length,
      postcode: raw,
      last_updated: new Date().toISOString(),
      source: 'HM Land Registry Price Paid Data',
    };
    valuationCache.set(raw, { data: result, timestamp: Date.now() });
    res.json(result);
  } catch (err) {
    console.error('Valuation error:', err.message);
    res.status(502).json({ error: 'Land Registry unavailable' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'asset-service' });
});

// Start server
const PORT = process.env.PORT || 3002;

async function start() {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set');
    process.exit(1);
  }
  await initDB();
  await connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`Asset Service running on port ${PORT}`);
  });
}

module.exports = app;

if (require.main === module) {
  start();
}
