import type { PoolClient } from 'pg';
import { withTransaction } from '../db/pool';
import { AppError } from '../utils/AppError';
import type { AssignResultDTO, CompleteResultDTO, TaskStatus } from '../types';

interface TaskLockRow {
  id: number;
  status: TaskStatus;
}

/**
 * Bloquea la fila de la tarea hasta el final de la transaccion.
 * Es el punto donde se serializan los requests concurrentes sobre una misma
 * tarea: sin este lock, dos /complete simultaneos podrian archivarla dos veces.
 */
async function lockTask(client: PoolClient, taskId: number): Promise<TaskLockRow> {
  const { rows } = await client.query<TaskLockRow>(
    `SELECT id, status FROM tasks WHERE id = $1 FOR UPDATE`,
    [taskId],
  );
  const task = rows[0];
  if (!task) {
    throw new AppError(404, 'TASK_NOT_FOUND', `No existe una tarea con id ${taskId}`);
  }
  return task;
}

/** Lanza 404 si alguno de los ids no corresponde a un usuario registrado. */
async function assertUsersExist(client: PoolClient, ids: readonly number[]): Promise<void> {
  const { rows } = await client.query<{ id: number }>(
    `SELECT id FROM users WHERE id = ANY($1::int[])`,
    [ids],
  );
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));

  if (missing.length > 0) {
    throw new AppError(
      404,
      'USER_NOT_FOUND',
      missing.length === 1
        ? `No existe un usuario con id ${missing[0]}`
        : `No existen usuarios con los ids ${missing.join(', ')}`,
    );
  }
}

/**
 * POST /tasks/:idTask/assign
 *
 * Los ids repetidos dentro del propio arreglo se colapsan, y los que ya
 * estaban asignados no se duplican: de eso se encarga el indice unico
 * (task_id, user_id) con ON CONFLICT DO NOTHING, no una consulta previa.
 */
export async function assignUsers(
  taskId: number,
  userIds: readonly number[],
): Promise<AssignResultDTO> {
  const unique = [...new Set(userIds)];

  return withTransaction(async (client) => {
    const task = await lockTask(client, taskId);

    if (task.status === 'archived') {
      throw new AppError(
        409,
        'TASK_ARCHIVED',
        'No se pueden asignar usuarios a una tarea archivada',
      );
    }

    await assertUsersExist(client, unique);

    const { rows } = await client.query<{ user_id: number }>(
      `INSERT INTO task_assignments (task_id, user_id)
       SELECT $1, unnest($2::int[])
       ON CONFLICT (task_id, user_id) DO NOTHING
       RETURNING user_id`,
      [taskId, unique],
    );

    const assigned = rows.map((r) => r.user_id);
    const already = unique.filter((id) => !assigned.includes(id));

    return {
      message: 'Usuarios asignados correctamente',
      taskId,
      assignedUserIds: assigned,
      alreadyAssignedUserIds: already,
    };
  });
}

interface AssignmentRow {
  id: number;
  completed: boolean;
}

/**
 * POST /tasks/:idTask/complete
 *
 * Marca la parte del usuario y, si con eso ya no queda nadie pendiente,
 * archiva la tarea. Todo dentro de una transaccion que arranca bloqueando
 * la fila de la tarea, de modo que solo una ejecucion puede hacer la
 * transicion open -> archived.
 */
export async function completeUserPart(
  taskId: number,
  userId: number,
): Promise<CompleteResultDTO> {
  return withTransaction(async (client) => {
    const task = await lockTask(client, taskId);

    const { rows: userRows } = await client.query<{ id: number }>(
      `SELECT id FROM users WHERE id = $1`,
      [userId],
    );
    if (userRows.length === 0) {
      throw new AppError(404, 'USER_NOT_FOUND', `No existe un usuario con id ${userId}`);
    }

    const { rows: assignmentRows } = await client.query<AssignmentRow>(
      `SELECT id, completed FROM task_assignments WHERE task_id = $1 AND user_id = $2`,
      [taskId, userId],
    );
    const assignment = assignmentRows[0];
    if (!assignment) {
      throw new AppError(
        404,
        'ASSIGNMENT_NOT_FOUND',
        `El usuario ${userId} no esta asignado a la tarea ${taskId}`,
      );
    }

    // Completar dos veces no es un error: la segunda vez no cambia nada y
    // conserva el completed_at original.
    if (!assignment.completed) {
      await client.query(
        `UPDATE task_assignments
            SET completed = true, completed_at = now()
          WHERE id = $1`,
        [assignment.id],
      );
    }

    const { rows: pendingRows } = await client.query<{ pendientes: string }>(
      `SELECT count(*) AS pendientes
         FROM task_assignments
        WHERE task_id = $1 AND completed = false`,
      [taskId],
    );
    const pendientes = Number(pendingRows[0]?.pendientes ?? 0);

    let status: TaskStatus = task.status;
    let archived = false;

    if (pendientes === 0 && task.status === 'open') {
      await client.query(
        `UPDATE tasks SET status = 'archived', archived_at = now() WHERE id = $1`,
        [taskId],
      );
      status = 'archived';
      archived = true;
    }

    return {
      message: archived
        ? 'Parte completada. Todos los asignados terminaron y la tarea fue archivada'
        : 'Parte completada',
      taskId,
      userId,
      taskStatus: status,
      archived,
    };
  });
}
