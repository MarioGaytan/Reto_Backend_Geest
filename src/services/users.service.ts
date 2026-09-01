import { DatabaseError } from 'pg';
import { query } from '../db/pool';
import { AppError } from '../utils/AppError';
import type {
  UserDTO,
  UserRow,
  UserTaskDTO,
  UserTaskRow,
  UserWithPendingTasksDTO,
  UserWithPendingTasksRow,
} from '../types';

const UNIQUE_VIOLATION = '23505';

function toUserDTO(row: UserRow): UserDTO {
  return {
    id: row.id,
    name: row.name,
    lastName: row.last_name,
    email: row.email,
    createdAt: row.created_at.toISOString(),
  };
}

export interface CreateUserInput {
  name: string;
  lastName: string;
  email: string;
}

export async function createUser(input: CreateUserInput): Promise<UserDTO> {
  try {
    const { rows } = await query<UserRow>(
      `INSERT INTO users (name, last_name, email)
       VALUES ($1, $2, $3)
       RETURNING id, name, last_name, email, created_at`,
      [input.name, input.lastName, input.email],
    );
    return toUserDTO(rows[0]!);
  } catch (error) {
    // Se deja fallar la insercion en vez de consultar antes si el email existe:
    // un SELECT previo no protege contra dos altas simultaneas, el indice unico si.
    if (error instanceof DatabaseError && error.code === UNIQUE_VIOLATION) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese correo electronico');
    }
    throw error;
  }
}

/**
 * Lista los usuarios con sus tareas pendientes.
 *
 * Se resuelve en una sola consulta agregando en la base con jsonb_agg: la
 * alternativa (una consulta por usuario) seria un N+1.
 */
export async function listUsers(): Promise<UserWithPendingTasksDTO[]> {
  const { rows } = await query<UserWithPendingTasksRow>(
    `SELECT u.id,
            u.name,
            u.last_name,
            u.email,
            u.created_at,
            COALESCE(
              jsonb_agg(
                jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status)
                ORDER BY t.id
              ) FILTER (WHERE t.id IS NOT NULL),
              '[]'::jsonb
            ) AS pending_tasks
       FROM users u
       LEFT JOIN task_assignments ta ON ta.user_id = u.id AND ta.completed = false
       LEFT JOIN tasks t ON t.id = ta.task_id
      GROUP BY u.id
      ORDER BY u.id`,
  );

  return rows.map((row) => ({
    ...toUserDTO(row),
    pendingTasks: row.pending_tasks,
  }));
}

/**
 * Lista las tareas asignadas a un usuario indicando si completo su parte.
 * GET /users/:idUser/tasks
 */
export async function listTasksByUser(userId: number): Promise<UserTaskDTO[]> {
  const { rowCount } = await query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
  if (rowCount === 0) {
    throw new AppError(404, 'USER_NOT_FOUND', `No existe un usuario con id ${userId}`);
  }

  const { rows } = await query<UserTaskRow>(
    `SELECT t.id,
            t.title,
            t.description,
            t.status,
            t.created_at,
            t.archived_at,
            ta.completed,
            ta.completed_at
       FROM task_assignments ta
       JOIN tasks t ON t.id = ta.task_id
      WHERE ta.user_id = $1
      ORDER BY t.id`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
    completed: row.completed,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  }));
}
