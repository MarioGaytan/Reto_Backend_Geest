import { api, authHeaders, get } from './helpers/api';
import { closePool, resetDatabase } from './helpers/db';

beforeAll(resetDatabase);
afterAll(closePool);

describe('autenticacion por API Key (extra)', () => {
  it('rechaza una lectura sin el header', async () => {
    const res = await api().get('/users');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza una escritura sin el header', async () => {
    const res = await api()
      .post('/users')
      .send({ name: 'A', lastName: 'B', email: 'a@b.com' });
    expect(res.status).toBe(401);
  });

  it('rechaza una clave incorrecta', async () => {
    const res = await api().get('/users').set('x-api-key', 'clave-incorrecta');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/no es valida/i);
  });

  it('acepta la clave correcta', async () => {
    const res = await get('/users');
    expect(res.status).toBe(200);
  });

  it('acepta la clave como Authorization: Bearer', async () => {
    const res = await api()
      .get('/users')
      .set('Authorization', `Bearer ${process.env.API_KEY}`);
    expect(res.status).toBe(200);
  });

  it('deja /health accesible sin clave, para el healthcheck del proveedor', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('mantiene el formato de error del reto en el 401', async () => {
    const res = await api().get('/tasks');
    expect(Object.keys(res.body)).toEqual(['error']);
    expect(Object.keys(res.body.error).sort()).toEqual(['code', 'message']);
  });

  it('devuelve 404 y no 401 en una ruta inexistente', async () => {
    const res = await api().get('/ruta-que-no-existe').set(authHeaders());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
