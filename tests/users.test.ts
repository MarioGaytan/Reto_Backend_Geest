import { api, authHeaders, createTask, createUser, get, post } from './helpers/api';
import { closePool, resetDatabase } from './helpers/db';

beforeEach(resetDatabase);
afterAll(closePool);

describe('POST /users', () => {
  it('registra un usuario y devuelve su id', async () => {
    const res = await post('/users', {
      name: 'Mario',
      lastName: 'Gaytan',
      email: 'mario@ejemplo.com',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      name: 'Mario',
      lastName: 'Gaytan',
      email: 'mario@ejemplo.com',
    });
    expect(res.body.createdAt).toEqual(expect.any(String));
  });

  it('normaliza el correo a minusculas', async () => {
    const res = await post('/users', {
      name: 'Mario',
      lastName: 'Gaytan',
      email: '  Mario@Ejemplo.COM ',
    });
    expect(res.body.email).toBe('mario@ejemplo.com');
  });

  it.each([
    ['falta name', { lastName: 'B', email: 'a@b.com' }],
    ['falta lastName', { name: 'A', email: 'a@b.com' }],
    ['falta email', { name: 'A', lastName: 'B' }],
    ['name en blanco', { name: '   ', lastName: 'B', email: 'a@b.com' }],
  ])('rechaza cuando %s', async (_caso, body) => {
    const res = await post('/users', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each(['no-es-email', 'sin@dominio', '@ejemplo.com'])(
    'rechaza el correo invalido %s',
    async (email) => {
      const res = await post('/users', { name: 'A', lastName: 'B', email });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('rechaza un correo ya registrado', async () => {
    await createUser('mario@ejemplo.com');
    const res = await post('/users', {
      name: 'Otro',
      lastName: 'Usuario',
      email: 'mario@ejemplo.com',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('detecta el duplicado aunque cambie el uso de mayusculas', async () => {
    await createUser('mario@ejemplo.com');
    const res = await post('/users', {
      name: 'Otro',
      lastName: 'Usuario',
      email: 'MARIO@Ejemplo.com',
    });

    expect(res.status).toBe(409);
  });

  it('rechaza un cuerpo JSON mal formado', async () => {
    const res = await api()
      .post('/users')
      .set(authHeaders())
      .set('Content-Type', 'application/json')
      .send('{"name":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('GET /users', () => {
  it('devuelve una lista vacia cuando no hay usuarios', async () => {
    const res = await get('/users');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lista los usuarios con sus tareas pendientes', async () => {
    const mario = await createUser('mario@ejemplo.com', 'Mario', 'Gaytan');
    const ana = await createUser('ana@ejemplo.com', 'Ana', 'Lopez');
    const tarea = await createTask('Migrar base de datos');

    await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id, ana.id] });
    await post(`/tasks/${tarea.id}/complete`, { userId: ana.id });

    const res = await get('/users');
    expect(res.status).toBe(200);

    const [porMario, porAna] = res.body;
    expect(porMario.pendingTasks).toEqual([
      { id: tarea.id, title: 'Migrar base de datos', status: 'open' },
    ]);
    // Ana ya completo su parte, asi que la tarea deja de estar pendiente.
    expect(porAna.pendingTasks).toEqual([]);
  });

  it('incluye a los usuarios sin ninguna tarea asignada', async () => {
    await createUser('solo@ejemplo.com');
    const res = await get('/users');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].pendingTasks).toEqual([]);
  });
});

describe('GET /users/:idUser/tasks', () => {
  it('lista las tareas del usuario indicando si completo su parte', async () => {
    const user = await createUser('mario@ejemplo.com');
    const a = await createTask('Tarea A');
    const b = await createTask('Tarea B');

    await post(`/tasks/${a.id}/assign`, { userIds: [user.id] });
    await post(`/tasks/${b.id}/assign`, { userIds: [user.id] });
    await post(`/tasks/${a.id}/complete`, { userId: user.id });

    const res = await get(`/users/${user.id}/tasks`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    // La tarea A queda archivada porque su unico asignado ya completo.
    expect(res.body[0]).toMatchObject({ id: a.id, completed: true, status: 'archived' });
    expect(res.body[0].completedAt).toEqual(expect.any(String));
    expect(res.body[1]).toMatchObject({ id: b.id, completed: false, completedAt: null });
  });

  it('devuelve 404 si el usuario no existe', async () => {
    const res = await get('/users/999/tasks');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('devuelve 400 si el id no es numerico', async () => {
    const res = await get('/users/abc/tasks');
    expect(res.status).toBe(400);
  });
});
