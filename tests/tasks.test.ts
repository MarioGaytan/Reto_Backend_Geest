import { createTask, createUser, get, post } from './helpers/api';
import { closePool, resetDatabase } from './helpers/db';

beforeEach(resetDatabase);
afterAll(closePool);

describe('POST /tasks', () => {
  it('registra una tarea con estado open por defecto', async () => {
    const res = await post('/tasks', {
      title: 'Migrar base de datos',
      description: 'De MySQL a Postgres',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      title: 'Migrar base de datos',
      description: 'De MySQL a Postgres',
      status: 'open',
      archivedAt: null,
    });
  });

  it('acepta una tarea sin descripcion', async () => {
    const res = await post('/tasks', { title: 'Revisar backups' });
    expect(res.status).toBe(201);
    expect(res.body.description).toBeNull();
  });

  it.each([
    ['falta title', {}],
    ['title en blanco', { title: '   ' }],
    ['title no es texto', { title: 42 }],
  ])('rechaza cuando %s', async (_caso, body) => {
    const res = await post('/tasks', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /tasks', () => {
  it('devuelve una lista vacia cuando no hay tareas', async () => {
    const res = await get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('indica que usuarios completaron su parte', async () => {
    const mario = await createUser('mario@ejemplo.com', 'Mario', 'Gaytan');
    const ana = await createUser('ana@ejemplo.com', 'Ana', 'Lopez');
    const tarea = await createTask('Migrar base de datos');

    await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id, ana.id] });
    await post(`/tasks/${tarea.id}/complete`, { userId: ana.id });

    const res = await get('/tasks');
    const asignados = res.body[0].assignees;

    expect(asignados).toHaveLength(2);
    expect(asignados.find((a: { id: number }) => a.id === mario.id)).toMatchObject({
      completed: false,
      completedAt: null,
    });
    expect(asignados.find((a: { id: number }) => a.id === ana.id)).toMatchObject({
      completed: true,
    });
  });

  it('devuelve las tareas sin asignados con un arreglo vacio, no null', async () => {
    await createTask('Sin asignar');
    const res = await get('/tasks');
    expect(res.body[0].assignees).toEqual([]);
  });

  it('filtra por status=open', async () => {
    const user = await createUser('mario@ejemplo.com');
    const abierta = await createTask('Sigue abierta');
    const cerrada = await createTask('Se archivara');

    await post(`/tasks/${cerrada.id}/assign`, { userIds: [user.id] });
    await post(`/tasks/${cerrada.id}/complete`, { userId: user.id });

    const res = await get('/tasks?status=open');
    expect(res.status).toBe(200);
    expect(res.body.map((t: { id: number }) => t.id)).toEqual([abierta.id]);
  });

  it('filtra por status=archived', async () => {
    const user = await createUser('mario@ejemplo.com');
    await createTask('Sigue abierta');
    const cerrada = await createTask('Se archivara');

    await post(`/tasks/${cerrada.id}/assign`, { userIds: [user.id] });
    await post(`/tasks/${cerrada.id}/complete`, { userId: user.id });

    const res = await get('/tasks?status=archived');
    expect(res.body.map((t: { id: number }) => t.id)).toEqual([cerrada.id]);
  });

  it('rechaza un status fuera del enum', async () => {
    const res = await get('/tasks?status=eliminada');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /tasks/:idTask', () => {
  it('devuelve la informacion completa con sus asignados', async () => {
    const mario = await createUser('mario@ejemplo.com', 'Mario', 'Gaytan');
    const tarea = await createTask('Migrar base de datos', 'De MySQL a Postgres');
    await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id] });

    const res = await get(`/tasks/${tarea.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: tarea.id,
      title: 'Migrar base de datos',
      description: 'De MySQL a Postgres',
      status: 'open',
    });
    expect(res.body.assignees[0]).toMatchObject({
      id: mario.id,
      name: 'Mario',
      lastName: 'Gaytan',
      email: 'mario@ejemplo.com',
      completed: false,
    });
  });

  it('devuelve 404 si la tarea no existe', async () => {
    const res = await get('/tasks/999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TASK_NOT_FOUND');
  });

  it('devuelve 400 si el id no es numerico', async () => {
    const res = await get('/tasks/abc');
    expect(res.status).toBe(400);
  });
});
