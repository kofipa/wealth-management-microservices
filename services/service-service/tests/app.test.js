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
  it('GET /health returns 200 without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('service-service');
  });
});

describe('authenticateToken', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/services');
    expect(res.status).toBe(401);
  });

  it('returns 403 with bad token', async () => {
    const res = await request(app).get('/api/services').set('Authorization', 'Bearer bad');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/services', () => {
  it('returns all 5 registered services', async () => {
    const res = await request(app)
      .get('/api/services')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(5);
    const names = res.body.services.map(s => s.name);
    expect(names).toContain('user-service');
    expect(names).toContain('asset-service');
    expect(names).toContain('liability-service');
    expect(names).toContain('networth-service');
    expect(names).toContain('document-service');
  });

  it('each service has name, port, url and description', async () => {
    const res = await request(app)
      .get('/api/services')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    for (const service of res.body.services) {
      expect(service).toHaveProperty('name');
      expect(service).toHaveProperty('port');
      expect(service).toHaveProperty('url');
      expect(service).toHaveProperty('description');
    }
  });
});

describe('GET /api/services/health', () => {
  it('returns up for all services when they respond', async () => {
    axios.get.mockResolvedValue({ data: { status: 'healthy' } });
    const res = await request(app)
      .get('/api/services/health')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(5);
    for (const service of res.body.services) {
      expect(service.status).toBe('up');
    }
  });

  it('marks service as down when it does not respond', async () => {
    axios.get.mockRejectedValue(new Error('Connection refused'));
    const res = await request(app)
      .get('/api/services/health')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    for (const service of res.body.services) {
      expect(service.status).toBe('down');
    }
  });
});

describe('GET /api/services/:name', () => {
  it('returns 404 for unknown service', async () => {
    const res = await request(app)
      .get('/api/services/unknown-service')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('returns service with status up when healthy', async () => {
    axios.get.mockResolvedValueOnce({ data: { status: 'healthy' } });
    const res = await request(app)
      .get('/api/services/user-service')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.service.name).toBe('user-service');
    expect(res.body.service.status).toBe('up');
  });

  it('returns service with status down when unreachable', async () => {
    axios.get.mockRejectedValueOnce(new Error('Connection refused'));
    const res = await request(app)
      .get('/api/services/user-service')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.service.status).toBe('down');
  });
});
