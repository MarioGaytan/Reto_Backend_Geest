import { pool } from '../../src/db/pool';

/**
 * Deja las tablas vacias y los contadores de id a 1, para que cada test
 * pueda contar con ids predecibles.
 */
export async function resetDatabase(): Promise<void> {
  await pool.query(`
    TRUNCATE task_assignments, notification_attempts, idempotency_keys, tasks, users
    RESTART IDENTITY CASCADE
  `);
}

export { closePool } from '../../src/db/pool';
export { pool };
