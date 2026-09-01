import { createTask, createUser, get, post } from './helpers/api';
import { closePool, pool, resetDatabase } from './helpers/db';
import { notifyServer } from './helpers/notify-server';

beforeEach(resetDatabase);
afterAll(closePool);

/** Tarea con dos asignados, ninguno ha completado todavia. */
async function tareaConDosAsignados() {
  const mario = await createUser('mario@ejemplo.com');
  const ana = await createUser('ana@ejemplo.com');
  const task = await createTask('Migrar base de datos');
  await post(`/tasks/${task.id}/assign`, { userIds: [mario.id, ana.id] });
  return { taskId: task.id, marioId: mario.id, anaId: ana.id };
}

describe('los dos ultimos usuarios completan a la vez', () => {
  it('archiva la tarea exactamente una vez', async () => {
    const { taskId, marioId, anaId } = await tareaConDosAsignados();

    const respuestas = await Promise.all([
      post(`/tasks/${taskId}/complete`, { userId: marioId }),
      post(`/tasks/${taskId}/complete`, { userId: anaId }),
    ]);

    expect(respuestas.every((r) => r.status === 200)).toBe(true);

    // Solo una de las dos transacciones puede realizar la transicion.
    const archivaron = respuestas.filter((r) => r.body.archived === true);
    expect(archivaron).toHaveLength(1);

    const { rows } = await pool.query(
      `SELECT status, archived_at FROM tasks WHERE id = $1`,
      [taskId],
    );
    expect(rows[0].status).toBe('archived');
    expect(rows[0].archived_at).not.toBeNull();
  });

  it('envia la notificacion exactamente una vez', async () => {
    const { taskId, marioId, anaId } = await tareaConDosAsignados();

    await Promise.all([
      post(`/tasks/${taskId}/complete`, { userId: marioId }),
      post(`/tasks/${taskId}/complete`, { userId: anaId }),
    ]);

    expect(notifyServer.received).toHaveLength(1);

    const res = await get(`/tasks/${taskId}/notifications`);
    expect(res.body).toHaveLength(1);
  });

  it('se comporta igual repitiendolo varias veces', async () => {
    for (let i = 0; i < 5; i++) {
      await resetDatabase();
      notifyServer.reset('ok');

      const { taskId, marioId, anaId } = await tareaConDosAsignados();
      const respuestas = await Promise.all([
        post(`/tasks/${taskId}/complete`, { userId: marioId }),
        post(`/tasks/${taskId}/complete`, { userId: anaId }),
      ]);

      expect(respuestas.filter((r) => r.body.archived === true)).toHaveLength(1);
      expect(notifyServer.received).toHaveLength(1);
    }
  });

  it('marca como completadas las partes de ambos usuarios', async () => {
    const { taskId, marioId, anaId } = await tareaConDosAsignados();

    await Promise.all([
      post(`/tasks/${taskId}/complete`, { userId: marioId }),
      post(`/tasks/${taskId}/complete`, { userId: anaId }),
    ]);

    const res = await get(`/tasks/${taskId}`);
    expect(res.body.assignees.every((a: { completed: boolean }) => a.completed)).toBe(true);
  });
});

describe('asignaciones simultaneas', () => {
  it('no duplica la relacion cuando llegan dos assign iguales a la vez', async () => {
    const mario = await createUser('mario@ejemplo.com');
    const task = await createTask('Migrar base de datos');

    await Promise.all([
      post(`/tasks/${task.id}/assign`, { userIds: [mario.id] }),
      post(`/tasks/${task.id}/assign`, { userIds: [mario.id] }),
    ]);

    const { rows } = await pool.query(
      'SELECT count(*)::int AS total FROM task_assignments WHERE task_id = $1',
      [task.id],
    );
    expect(rows[0].total).toBe(1);
  });
});
