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

const LIABILITY = { id: 1, user_id: 1, liability_type: 'short_term', name: 'Credit Card', amount: 5000, currency: 'USD' };

describe('Health', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('liability-service');
  });
});

describe('authenticateToken', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/liabilities');
    expect(res.status).toBe(401);
  });

  it('returns 403 with bad token', async () => {
    const res = await request(app).get('/api/liabilities').set('Authorization', 'Bearer bad');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/liabilities/short-term', () => {
  it('creates a short-term liability', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [LIABILITY] });
    const res = await request(app)
      .post('/api/liabilities/short-term')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'Credit Card', amount: 5000 });
    expect(res.status).toBe(201);
    expect(res.body.liability.name).toBe('Credit Card');
  });
});

describe('POST /api/liabilities/long-term', () => {
  it('creates a long-term liability', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...LIABILITY, liability_type: 'long_term', name: 'Mortgage', amount: 300000 }] });
    const res = await request(app)
      .post('/api/liabilities/long-term')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ name: 'Mortgage', amount: 300000 });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/liabilities', () => {
  it('returns list of liabilities', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [LIABILITY] });
    const res = await request(app)
      .get('/api/liabilities')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.liabilities).toHaveLength(1);
  });
});

describe('GET /api/liabilities/total/amount', () => {
  it('returns total liability amount', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ total_amount: 305000 }] });
    const res = await request(app)
      .get('/api/liabilities/total/amount')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.totalAmount).toBe(305000);
  });
});

describe('GET /api/liabilities/:id', () => {
  it('returns 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/liabilities/99')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('returns liability when found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [LIABILITY] });
    const res = await request(app)
      .get('/api/liabilities/1')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.liability).toBeDefined();
  });
});

describe('PUT /api/liabilities/:id', () => {
  it('updates a liability', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...LIABILITY, amount: 4000 }] });
    const res = await request(app)
      .put('/api/liabilities/1')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ amount: 4000 });
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/liabilities/99')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ amount: 4000 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/liabilities/:id', () => {
  it('deletes a liability', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [LIABILITY] });
    const res = await request(app)
      .delete('/api/liabilities/1')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/api/liabilities/99')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });
});
