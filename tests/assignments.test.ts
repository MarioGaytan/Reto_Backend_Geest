import { createTask, createUser, get, post } from './helpers/api';
import { closePool, pool, resetDatabase } from './helpers/db';

beforeEach(resetDatabase);
afterAll(closePool);

describe('POST /tasks/:idTask/assign', () => {
  it('asigna el arreglo de usuarios a la tarea', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const ana = await createUser('ana@ejemplo.com');
    const tarea = await createTask('Migrar base de datos');

    const res = await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id, ana.id] });

    expect(res.status).toBe(200);
    expect(res.body.assignedUserIds).toEqual([mario.id, ana.id]);
    expect(res.body.alreadyAssignedUserIds).toEqual([]);
  });

  it('no duplica la relacion al reasignar a los mismos usuarios', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const tarea = await createTask('Migrar base de datos');

    await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id] });
    const res = await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id] });

    expect(res.status).toBe(200);
    expect(res.body.assignedUserIds).toEqual([]);
    expect(res.body.alreadyAssignedUserIds).toEqual([mario.id]);

    const { rows } = await pool.query(
      'SELECT count(*)::int AS total FROM task_assignments WHERE task_id = $1',
      [tarea.id],
    );
    expect(rows[0].total).toBe(1);
  });

  it('colapsa los ids repetidos dentro del propio arreglo', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const tarea = await createTask('Migrar base de datos');

    const res = await post(`/tasks/${tarea.id}/assign`, {
      userIds: [mario.id, mario.id, mario.id],
    });

    expect(res.status).toBe(200);
    expect(res.body.assignedUserIds).toEqual([mario.id]);
  });

  it('devuelve 404 si la tarea no existe', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const res = await post('/tasks/999/assign', { userIds: [mario.id] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TASK_NOT_FOUND');
  });

  it('devuelve 404 si alguno de los usuarios no existe', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const tarea = await createTask('Migrar base de datos');

    const res = await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id, 999] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
    expect(res.body.error.message).toContain('999');
  });

  it('no asigna a nadie si uno de los ids es invalido', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const tarea = await createTask('Migrar base de datos');

    await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id, 999] });

    const { rows } = await pool.query(
      'SELECT count(*)::int AS total FROM task_assignments WHERE task_id = $1',
      [tarea.id],
    );
    expect(rows[0].total).toBe(0);
  });

  it.each([
    ['userIds vacio', { userIds: [] }],
    ['sin userIds', {}],
    ['userIds no es arreglo', { userIds: 1 }],
  ])('rechaza cuando %s', async (_caso, body) => {
    const tarea = await createTask('Migrar base de datos');
    const res = await post(`/tasks/${tarea.id}/assign`, body);
    expect(res.status).toBe(400);
  });

  it('rechaza asignar a una tarea ya archivada', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const ana = await createUser('ana@ejemplo.com');
    const tarea = await createTask('Migrar base de datos');

    await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id] });
    await post(`/tasks/${tarea.id}/complete`, { userId: mario.id });

    const res = await post(`/tasks/${tarea.id}/assign`, { userIds: [ana.id] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_ARCHIVED');
  });
});

describe('POST /tasks/:idTask/complete', () => {
  it('marca la parte del usuario como completada', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const ana = await createUser('ana@ejemplo.com');
    const tarea = await createTask('Migrar base de datos');
    await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id, ana.id] });

    const res = await post(`/tasks/${tarea.id}/complete`, { userId: mario.id });

    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(false);
    expect(res.body.taskStatus).toBe('open');
  });

  it('archiva la tarea cuando el ultimo asignado completa', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const ana = await createUser('ana@ejemplo.com');
    const tarea = await createTask('Migrar base de datos');
    await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id, ana.id] });

    await post(`/tasks/${tarea.id}/complete`, { userId: mario.id });
    const res = await post(`/tasks/${tarea.id}/complete`, { userId: ana.id });

    expect(res.body.archived).toBe(true);
    expect(res.body.taskStatus).toBe('archived');

    const detalle = await get(`/tasks/${tarea.id}`);
    expect(detalle.body.status).toBe('archived');
    expect(detalle.body.archivedAt).toEqual(expect.any(String));
  });

  it('devuelve 404 si la tarea no existe', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const res = await post('/tasks/999/complete', { userId: mario.id });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TASK_NOT_FOUND');
  });

  it('devuelve 404 si el usuario no existe', async () => {
    const tarea = await createTask('Migrar base de datos');
    const res = await post(`/tasks/${tarea.id}/complete`, { userId: 999 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('devuelve 404 si el usuario no esta asignado a la tarea', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const tarea = await createTask('Migrar base de datos');

    const res = await post(`/tasks/${tarea.id}/complete`, { userId: mario.id });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ASSIGNMENT_NOT_FOUND');
  });

  it('rechaza la peticion sin userId', async () => {
    const tarea = await createTask('Migrar base de datos');
    const res = await post(`/tasks/${tarea.id}/complete`, {});
    expect(res.status).toBe(400);
  });

  it('completar dos veces no altera el completedAt original', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const ana = await createUser('ana@ejemplo.com');
    const tarea = await createTask('Migrar base de datos');
    await post(`/tasks/${tarea.id}/assign`, { userIds: [mario.id, ana.id] });

    await post(`/tasks/${tarea.id}/complete`, { userId: mario.id });
    const primero = await get(`/tasks/${tarea.id}`);
    const completadoEn = primero.body.assignees.find(
      (a: { id: number }) => a.id === mario.id,
    ).completedAt;

    const repetido = await post(`/tasks/${tarea.id}/complete`, { userId: mario.id });
    expect(repetido.status).toBe(200);

    const segundo = await get(`/tasks/${tarea.id}`);
    expect(
      segundo.body.assignees.find((a: { id: number }) => a.id === mario.id).completedAt,
    ).toBe(completadoEn);
  });
});
