const request = require('supertest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key';
const TEST_TOKEN = jwt.sign({ userId: 1, email: 'test@test.com' }, JWT_SECRET);

// Mock amqplib before requiring app
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

// Mock pg
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({ query: mockQuery, release: mockRelease });
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({ query: mockQuery, connect: mockConnect }))
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true)
}));

const app = require('../src/app');

beforeEach(() => {
  jest.clearAllMocks();
  // Default: initDB succeeds
  mockConnect.mockResolvedValue({ query: jest.fn(), release: mockRelease });
});

describe('Health', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});

describe('authenticateToken middleware', () => {
  it('returns 401 when no token provided', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
  });

  it('returns 403 when token is invalid', async () => {
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer badtoken');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/users/register', () => {
  it('returns 400 when email or password missing', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
  });

  it('returns 201 on successful registration', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'test@test.com', created_at: new Date() }]
    });
    const res = await request(app)
      .post('/api/users/register')
      .send({ email: 'test@test.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test@test.com');
  });

  it('returns 409 when user already exists', async () => {
    const err = new Error('duplicate');
    err.code = '23505';
    mockQuery.mockRejectedValueOnce(err);
    const res = await request(app)
      .post('/api/users/register')
      .send({ email: 'test@test.com', password: 'password123' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/users/login', () => {
  it('returns 401 when user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/users/login')
      .send({ email: 'test@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('returns token on successful login', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'test@test.com', password_hash: 'hashed' }]
    });
    const res = await request(app)
      .post('/api/users/login')
      .send({ email: 'test@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });
});

describe('GET /api/users/profile', () => {
  it('returns 404 when user not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('returns profile when user exists', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'test@test.com', first_name: 'John' }]
    });
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.profile).toBeDefined();
  });
});

describe('POST /api/users/profile', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/users/profile').send({});
    expect(res.status).toBe(401);
  });

  it('creates profile when none exists', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // check existing
      .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 1, first_name: 'John' }] }); // insert
    const res = await request(app)
      .post('/api/users/profile')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .send({ first_name: 'John', last_name: 'Doe' });
    expect(res.status).toBe(200);
  });
});
