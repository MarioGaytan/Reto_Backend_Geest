import { DatabaseError } from 'pg';
import { query } from '../db/pool';
import { AppError } from '../utils/AppError';
import type {
  UserDTO,
  UserRow,
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

/** Devuelve los ids que no existen en la tabla, en el orden recibido. */
export async function findMissingUserIds(ids: readonly number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const { rows } = await query<{ id: number }>(
    `SELECT id FROM users WHERE id = ANY($1::int[])`,
    [ids],
  );
  const found = new Set(rows.map((r) => r.id));
  return ids.filter((id) => !found.has(id));
}
