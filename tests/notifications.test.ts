import { createTask, createUser, get, post } from './helpers/api';
import { closePool, pool, resetDatabase } from './helpers/db';
import { notifyServer } from './helpers/notify-server';

beforeEach(resetDatabase);
afterAll(closePool);

/** Crea una tarea con un solo asignado, lista para archivarse al completar. */
async function tareaLista(titulo = 'Migrar base de datos') {
  const user = await createUser('mario@ejemplo.com');
  const task = await createTask(titulo);
  await post(`/tasks/${task.id}/assign`, { userIds: [user.id] });
  return { userId: user.id, taskId: task.id };
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera a que terminen los reintentos que corren en segundo plano. */
async function esperarIntentos(taskId: number, cuantos: number): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const { rows } = await pool.query(
      'SELECT count(*)::int AS total FROM notification_attempts WHERE task_id = $1',
      [taskId],
    );
    if (rows[0].total >= cuantos) {
      await esperar(150);
      return;
    }
    await esperar(150);
  }
}

describe('notificacion al archivar', () => {
  it('envia el payload que exige el reto', async () => {
    const { taskId, userId } = await tareaLista('Migrar base de datos');
    await post(`/tasks/${taskId}/complete`, { userId });

    expect(notifyServer.received).toHaveLength(1);
    expect(notifyServer.received[0]!.body).toEqual({
      taskId,
      title: 'Migrar base de datos',
      archivedAt: expect.any(String),
    });
  });

  it('registra un unico intento con exito cuando el destino responde 200', async () => {
    const { taskId, userId } = await tareaLista();
    await post(`/tasks/${taskId}/complete`, { userId });

    const res = await get(`/tasks/${taskId}/notifications`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      taskId,
      attemptNumber: 1,
      httpStatus: 200,
      success: true,
    });
  });

  it('no notifica mientras queden asignados sin completar', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const ana = await createUser('ana@ejemplo.com');
    const task = await createTask('Migrar base de datos');
    await post(`/tasks/${task.id}/assign`, { userIds: [mario.id, ana.id] });

    await post(`/tasks/${task.id}/complete`, { userId: mario.id });

    expect(notifyServer.received).toHaveLength(0);
    const res = await get(`/tasks/${task.id}/notifications`);
    expect(res.body).toEqual([]);
  });
});

describe('reintentos', () => {
  it('reintenta hasta 3 veces ante un 5xx', async () => {
    notifyServer.reset('500');
    const { taskId, userId } = await tareaLista();

    await post(`/tasks/${taskId}/complete`, { userId });
    await esperarIntentos(taskId, 3);

    const res = await get(`/tasks/${taskId}/notifications`);
    expect(res.body).toHaveLength(3);
    expect(res.body.map((a: { attemptNumber: number }) => a.attemptNumber)).toEqual([1, 2, 3]);
    expect(res.body.every((a: { success: boolean }) => a.success === false)).toBe(true);
    expect(res.body.every((a: { httpStatus: number }) => a.httpStatus === 500)).toBe(true);
  });

  it('espera cada vez mas entre reintentos', async () => {
    notifyServer.reset('500');
    const { taskId, userId } = await tareaLista();

    await post(`/tasks/${taskId}/complete`, { userId });
    await esperarIntentos(taskId, 3);

    const [t1, t2, t3] = notifyServer.received.map((r) => r.at);
    const primeraEspera = t2! - t1!;
    const segundaEspera = t3! - t2!;

    expect(primeraEspera).toBeGreaterThanOrEqual(900);
    expect(segundaEspera).toBeGreaterThan(primeraEspera);
    expect(segundaEspera).toBeGreaterThanOrEqual(1900);
  });

  it('no reintenta ante un 4xx, porque el destino entendio y rechazo', async () => {
    notifyServer.reset('404');
    const { taskId, userId } = await tareaLista();

    await post(`/tasks/${taskId}/complete`, { userId });
    await esperar(3_500);

    const res = await get(`/tasks/${taskId}/notifications`);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ httpStatus: 404, success: false });
  });

  it('guarda httpStatus null cuando el destino no responde', async () => {
    notifyServer.reset('reset');
    const { taskId, userId } = await tareaLista();

    await post(`/tasks/${taskId}/complete`, { userId });
    await esperarIntentos(taskId, 3);

    const res = await get(`/tasks/${taskId}/notifications`);
    expect(res.body).toHaveLength(3);
    expect(res.body.every((a: { httpStatus: null }) => a.httpStatus === null)).toBe(true);
  });

  it('deja de reintentar en cuanto el destino se recupera', async () => {
    notifyServer.reset('500');
    const { taskId, userId } = await tareaLista();

    await post(`/tasks/${taskId}/complete`, { userId });
    notifyServer.mode = 'ok';
    await esperarIntentos(taskId, 2);
    await esperar(2_500);

    const res = await get(`/tasks/${taskId}/notifications`);
    expect(res.body).toHaveLength(2);
    expect(res.body[1]).toMatchObject({ attemptNumber: 2, httpStatus: 200, success: true });
  });
});

describe('GET /tasks/:idTask/notifications', () => {
  it('devuelve un arreglo vacio si la tarea no se ha archivado', async () => {
    const task = await createTask('Sin archivar');
    const res = await get(`/tasks/${task.id}/notifications`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('devuelve 404 si la tarea no existe', async () => {
    const res = await get('/tasks/999/notifications');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TASK_NOT_FOUND');
  });
});
