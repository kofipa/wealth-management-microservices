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

const DOCUMENT = {
  id: 1, user_id: 1, filename: '123_test.pdf', original_name: 'test.pdf',
  mime_type: 'application/pdf', file_size: 1024, related_entity_type: 'general'
};

describe('Health', () => {
  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('document-service');
  });
});

describe('authenticateToken', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
  });

  it('returns 403 with bad token', async () => {
    const res = await request(app).get('/api/documents').set('Authorization', 'Bearer bad');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/documents/upload', () => {
  it('returns 400 when no file attached', async () => {
    const res = await request(app)
      .post('/api/documents/upload')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(400);
  });

  it('uploads a document successfully', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DOCUMENT] });
    const res = await request(app)
      .post('/api/documents/upload')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .attach('file', Buffer.from('test content'), 'test.pdf')
      .field('description', 'Test document');
    expect(res.status).toBe(201);
    expect(res.body.document).toBeDefined();
  });
});

describe('GET /api/documents', () => {
  it('returns list of documents', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [DOCUMENT] });
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
  });
});

describe('GET /api/documents/:id/download', () => {
  it('returns 404 when document not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/documents/99/download')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('returns file when found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...DOCUMENT, file_data: Buffer.from('file content') }]
    });
    const res = await request(app)
      .get('/api/documents/1/download')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/documents/:id', () => {
  it('deletes a document', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .delete('/api/documents/1')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 when document not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .delete('/api/documents/99')
      .set('Authorization', `Bearer ${TEST_TOKEN}`);
    expect(res.status).toBe(404);
  });
});
