import request from 'supertest';
import { app } from '../../src/app';

/**
 * La clave nunca se escribe a mano en los tests: se lee del mismo sitio del
 * que la lee la aplicacion. Si cambia el esquema de autenticacion, se toca
 * unicamente este archivo.
 */
export function authHeaders(): Record<string, string> {
  return { 'x-api-key': process.env.API_KEY! };
}

export const api = () => request(app);

/** POST autenticado, con Idempotency-Key opcional. */
export function post(path: string, body: unknown, idempotencyKey?: string) {
  const req = request(app).post(path).set(authHeaders());
  if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
  return req.send(body as object);
}

export function get(path: string) {
  return request(app).get(path).set(authHeaders());
}

export async function createUser(email: string, name = 'Test', lastName = 'User') {
  const res = await post('/users', { name, lastName, email });
  return res.body as { id: number };
}

export async function createTask(title: string, description?: string) {
  const res = await post('/tasks', description ? { title, description } : { title });
  return res.body as { id: number };
}

export { app };
