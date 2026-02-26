const request = require('supertest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key';
const TEST_TOKEN = jwt.sign({ userId: 1, email: 'test@test.com' }, JWT_SECRET);

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertExchange: jest.fn(),
      assertQueue: jest.fn().mockResolvedValue({ queue: 'q' }),
      bindQueue: jest.fn(),
      consume: jest.fn(),
      publish: jest.fn(),
      ack: jest.fn()
    })
  })
}));

const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: jest.fn(), release: mockRelease });
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({ query: mockQuery, connect: mockConnect }))
}));

const app = require('../src/app');

beforeEach(() => jest.clearAllMocks());

const ASSET = { id: 1, user_id: 1, asset_type: 'cash', name: 'Savings', value: 5000, currency: 'USD' };

describe('Health', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('asset-service');
  });
});

describe('authenticateToken', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/assets');
    expect(res.status).toBe(401);
  });

  it('returns 403 with bad token', async () => {
    const res = await request(app).get('/api/assets').set('Authorization', 'Bearer badtoken');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/assets/cash', () => {
  it('creates a cash asset', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ASSET] });
    const res = await request(app)
      .post('/api/assets/cash')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'Savings', value: 5000 });
    expect(res.status).toBe(201);
    expect(res.body.asset.name).toBe('Savings');
  });
});

describe('POST /api/assets/investment', () => {
  it('creates an investment asset', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...ASSET, asset_type: 'investment' }] });
    const res = await request(app)
      .post('/api/assets/investment')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'Stocks', value: 10000 });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/assets/property', () => {
  it('creates a property asset', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...ASSET, asset_type: 'property' }] });
    const res = await request(app)
      .post('/api/assets/property')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'House', value: 300000 });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/assets/other', () => {
  it('creates an other asset', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...ASSET, asset_type: 'other' }] });
    const res = await request(app)
      .post('/api/assets/other')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'Gold', value: 2000 });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/assets', () => {
  it('returns list of assets', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ASSET] });
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.assets).toHaveLength(1);
  });
});

describe('GET /api/assets/total/value', () => {
  it('returns total asset value', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total_value: 15000 }] });
    const res = await request(app)
      .get('/api/assets/total/value')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.totalValue).toBe(15000);
  });
});

describe('GET /api/assets/:id', () => {
  it('returns 404 when asset not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/assets/99')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('returns asset when found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ASSET] });
    const res = await request(app)
      .get('/api/assets/1')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.asset).toBeDefined();
  });
});

describe('PUT /api/assets/:id', () => {
  it('updates an asset', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...ASSET, value: 6000 }] });
    const res = await request(app)
      .put('/api/assets/1')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ value: 6000 });
    expect(res.status).toBe(200);
  });

  it('returns 404 when asset not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/assets/99')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ value: 6000 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/assets/:id', () => {
  it('deletes an asset', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [ASSET] });
    const res = await request(app)
      .delete('/api/assets/1')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 when asset not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/api/assets/99')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });
});
