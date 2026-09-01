import request from 'supertest';
import { app } from '../src/app';
import { closePool } from '../src/db/pool';

afterAll(async () => {
  await closePool();
});

describe('GET /health', () => {
  it('responde con el estado del servicio', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
  });
});

describe('rutas desconocidas', () => {
  it('devuelve 404 con el formato de error estandar', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
