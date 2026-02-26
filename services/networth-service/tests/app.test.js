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

jest.mock('axios');
const axios = require('axios');

const app = require('../src/app');

beforeEach(() => jest.clearAllMocks());

describe('Health', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('networth-service');
  });
});

describe('authenticateToken', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/networth/calculate');
    expect(res.status).toBe(401);
  });

  it('returns 403 with bad token', async () => {
    const res = await request(app).get('/api/networth/calculate').set('Authorization', 'Bearer bad');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/networth/calculate', () => {
  it('returns net worth calculation', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { totalValue: 100000 } })  // assets
      .mockResolvedValueOnce({ data: { totalAmount: 30000 } }); // liabilities
    const res = await request(app)
      .get('/api/networth/calculate')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.netWorth).toBe(70000);
    expect(res.body.totalAssets).toBe(100000);
    expect(res.body.totalLiabilities).toBe(30000);
  });

  it('returns 500 when a downstream service fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('Service unavailable'));
    const res = await request(app)
      .get('/api/networth/calculate')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(500);
  });
});

describe('GET /api/networth/breakdown', () => {
  it('returns detailed breakdown', async () => {
    axios.get
      .mockResolvedValueOnce({ data: { assets: [{ asset_type: 'cash', value: '50000' }, { asset_type: 'investment', value: '50000' }] } })
      .mockResolvedValueOnce({ data: { liabilities: [{ liability_type: 'long_term', amount: '30000' }] } });
    const res = await request(app)
      .get('/api/networth/breakdown')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.netWorth).toBe(70000);
    expect(res.body.assetsByType.cash).toBe(50000);
    expect(res.body.assetsByType.investment).toBe(50000);
  });

  it('returns 500 when a downstream service fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('Service unavailable'));
    const res = await request(app)
      .get('/api/networth/breakdown')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(500);
  });
});
