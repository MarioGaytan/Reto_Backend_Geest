import { api, authHeaders, createTask, createUser, post } from './helpers/api';
import { closePool, pool, resetDatabase } from './helpers/db';

beforeEach(resetDatabase);
afterAll(closePool);

const usuario = { name: 'Mario', lastName: 'Gaytan', email: 'mario@ejemplo.com' };

async function contarUsuarios(): Promise<number> {
  const { rows } = await pool.query('SELECT count(*)::int AS total FROM users');
  return rows[0].total;
}

describe('Idempotency-Key en secuencia', () => {
  it('ejecuta una sola vez y devuelve una respuesta identica', async () => {
    const primera = await post('/users', usuario, 'llave-1');
    const segunda = await post('/users', usuario, 'llave-1');

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.text).toBe(primera.text);
    expect(await contarUsuarios()).toBe(1);
  });

  it('reconoce el mismo cuerpo con las claves reordenadas', async () => {
    const primera = await post('/users', usuario, 'llave-2');
    const segunda = await post(
      '/users',
      { email: usuario.email, lastName: usuario.lastName, name: usuario.name },
      'llave-2',
    );

    expect(segunda.text).toBe(primera.text);
    expect(await contarUsuarios()).toBe(1);
  });

  it('rechaza la misma llave con un cuerpo distinto', async () => {
    await post('/users', usuario, 'llave-3');
    const res = await post(
      '/users',
      { name: 'Otro', lastName: 'Usuario', email: 'otro@ejemplo.com' },
      'llave-3',
    );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await contarUsuarios()).toBe(1);
  });

  it('trata la misma llave en otro endpoint como otra operacion', async () => {
    const user = await post('/users', usuario, 'llave-compartida');
    const task = await post('/tasks', { title: 'Migrar base de datos' }, 'llave-compartida');

    expect(user.status).toBe(201);
    expect(task.status).toBe(201);
    expect(task.body.title).toBe('Migrar base de datos');
  });

  it('trata la misma llave en dos tareas distintas como operaciones distintas', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const a = await createTask('Tarea A');
    const b = await createTask('Tarea B');
    await post(`/tasks/${a.id}/assign`, { userIds: [mario.id] });
    await post(`/tasks/${b.id}/assign`, { userIds: [mario.id] });

    const uno = await post(`/tasks/${a.id}/complete`, { userId: mario.id }, 'misma-llave');
    const dos = await post(`/tasks/${b.id}/complete`, { userId: mario.id }, 'misma-llave');

    expect(uno.body.taskId).toBe(a.id);
    expect(dos.body.taskId).toBe(b.id);
    expect(dos.body.archived).toBe(true);
  });

  it('reproduce tambien una respuesta de error 4xx', async () => {
    const cuerpoInvalido = { name: 'A', lastName: 'B', email: 'no-es-email' };

    const primera = await post('/users', cuerpoInvalido, 'llave-error');
    const segunda = await post('/users', cuerpoInvalido, 'llave-error');

    expect(primera.status).toBe(400);
    expect(segunda.status).toBe(400);
    expect(segunda.text).toBe(primera.text);
  });

  it('ejecuta cada peticion cuando no se envia el header', async () => {
    await post('/tasks', { title: 'Sin llave' });
    await post('/tasks', { title: 'Sin llave' });

    const { rows } = await pool.query('SELECT count(*)::int AS total FROM tasks');
    expect(rows[0].total).toBe(2);
  });

  it('rechaza un header vacio', async () => {
    const res = await api()
      .post('/tasks')
      .set(authHeaders())
      .set('Idempotency-Key', '   ')
      .send({ title: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });
});

describe('Idempotency-Key en paralelo', () => {
  it('ejecuta una sola vez con dos peticiones simultaneas', async () => {
    const [a, b] = await Promise.all([
      post('/users', usuario, 'paralela-1'),
      post('/users', usuario, 'paralela-1'),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    // El reto exige que ambas respuestas sean identicas, no solo equivalentes.
    expect(a.text).toBe(b.text);
    expect(await contarUsuarios()).toBe(1);
  });

  it('devuelve la misma respuesta a cinco peticiones simultaneas', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () => post('/users', usuario, 'paralela-5')),
    );

    const distintas = new Set(respuestas.map((r) => `${r.status}|${r.text}`));
    expect(distintas.size).toBe(1);
    expect(await contarUsuarios()).toBe(1);
  });

  it('registra una sola llave por operacion', async () => {
    await Promise.all(
      Array.from({ length: 4 }, () => post('/users', usuario, 'paralela-llaves')),
    );

    const { rows } = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE response_status IS NULL)::int AS sin_respuesta
         FROM idempotency_keys`,
    );
    expect(rows[0].total).toBe(1);
    expect(rows[0].sin_respuesta).toBe(0);
  });
});
