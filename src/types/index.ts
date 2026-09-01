/** Formas que devuelve la API. Todas en camelCase. */

export interface UserDTO {
  id: number;
  name: string;
  lastName: string;
  email: string;
  createdAt: string;
}

/** Tarea pendiente tal como aparece dentro de GET /users. */
export interface PendingTaskDTO {
  id: number;
  title: string;
  status: TaskStatus;
}

export interface UserWithPendingTasksDTO extends UserDTO {
  pendingTasks: PendingTaskDTO[];
}

export type TaskStatus = 'open' | 'archived';

/** Usuario asignado a una tarea, con su estado de completado. */
export interface AssigneeDTO {
  id: number;
  name: string;
  lastName: string;
  email: string;
  completed: boolean;
  completedAt: string | null;
}

export interface TaskDTO {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdAt: string;
  archivedAt: string | null;
}

export interface TaskWithAssigneesDTO extends TaskDTO {
  assignees: AssigneeDTO[];
}

/** Filas crudas de PostgreSQL, en snake_case. */

export interface UserRow {
  id: number;
  name: string;
  last_name: string;
  email: string;
  created_at: Date;
}

export interface UserWithPendingTasksRow extends UserRow {
  pending_tasks: PendingTaskDTO[];
}

export interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  created_at: Date;
  archived_at: Date | null;
}

export interface RawAssignee {
  id: number;
  name: string;
  lastName: string;
  email: string;
  completed: boolean;
  completedAt: string | null;
}

export interface TaskWithAssigneesRow extends TaskRow {
  assignees: RawAssignee[];
}
