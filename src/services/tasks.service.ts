import { query } from '../db/pool';
import { AppError } from '../utils/AppError';
import type {
  AssigneeDTO,
  RawAssignee,
  TaskDTO,
  TaskRow,
  TaskStatus,
  TaskWithAssigneesDTO,
  TaskWithAssigneesRow,
} from '../types';

function toTaskDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
  };
}

/** Normaliza las fechas que llegan ya serializadas dentro del jsonb. */
function toAssigneeDTO(raw: RawAssignee): AssigneeDTO {
  return {
    id: raw.id,
    name: raw.name,
    lastName: raw.lastName,
    email: raw.email,
    completed: raw.completed,
    completedAt: raw.completedAt ? new Date(raw.completedAt).toISOString() : null,
  };
}

function toTaskWithAssigneesDTO(row: TaskWithAssigneesRow): TaskWithAssigneesDTO {
  return { ...toTaskDTO(row), assignees: row.assignees.map(toAssigneeDTO) };
}

export interface CreateTaskInput {
  title: string;
  description: string | null;
}

export async function createTask(input: CreateTaskInput): Promise<TaskDTO> {
  const { rows } = await query<TaskRow>(
    `INSERT INTO tasks (title, description)
     VALUES ($1, $2)
     RETURNING id, title, description, status, created_at, archived_at`,
    [input.title, input.description],
  );
  return toTaskDTO(rows[0]!);
}

/**
 * Una sola consulta para tareas y asignados. El LEFT JOIN conserva las tareas
 * sin asignar, y el FILTER evita que produzcan un asignado nulo.
 */
const SELECT_TASKS_WITH_ASSIGNEES = `
  SELECT t.id,
         t.title,
         t.description,
         t.status,
         t.created_at,
         t.archived_at,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',          u.id,
               'name',        u.name,
               'lastName',    u.last_name,
               'email',       u.email,
               'completed',   ta.completed,
               'completedAt', ta.completed_at
             ) ORDER BY u.id
           ) FILTER (WHERE u.id IS NOT NULL),
           '[]'::jsonb
         ) AS assignees
    FROM tasks t
    LEFT JOIN task_assignments ta ON ta.task_id = t.id
    LEFT JOIN users u ON u.id = ta.user_id
`;

export async function listTasks(status?: TaskStatus): Promise<TaskWithAssigneesDTO[]> {
  const { rows } = await query<TaskWithAssigneesRow>(
    `${SELECT_TASKS_WITH_ASSIGNEES}
      WHERE $1::task_status IS NULL OR t.status = $1::task_status
      GROUP BY t.id
      ORDER BY t.id`,
    [status ?? null],
  );
  return rows.map(toTaskWithAssigneesDTO);
}

export async function getTaskById(id: number): Promise<TaskWithAssigneesDTO> {
  const { rows } = await query<TaskWithAssigneesRow>(
    `${SELECT_TASKS_WITH_ASSIGNEES}
      WHERE t.id = $1
      GROUP BY t.id`,
    [id],
  );

  const row = rows[0];
  if (!row) {
    throw new AppError(404, 'TASK_NOT_FOUND', `No existe una tarea con id ${id}`);
  }
  return toTaskWithAssigneesDTO(row);
}

/** true si la tarea existe. Lo usaran /assign y /complete. */
export async function taskExists(id: number): Promise<boolean> {
  const { rowCount } = await query(`SELECT 1 FROM tasks WHERE id = $1`, [id]);
  return rowCount === 1;
}
