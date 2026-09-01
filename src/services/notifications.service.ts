import { query } from '../db/pool';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import type {
  ArchivedTaskPayload,
  NotificationAttemptDTO,
  NotificationAttemptRow,
} from '../types';

/** Maximo de intentos que exige el reto. */
const MAX_ATTEMPTS = 3;

/** Espera antes del intento N (el primero sale de inmediato). */
const BACKOFF_MS = [0, 1_000, 2_000];

const REQUEST_TIMEOUT_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface AttemptOutcome {
  success: boolean;
  httpStatus: number | null;
  /** Un 4xx significa que el destino entendio y rechazo: insistir no ayuda. */
  retryable: boolean;
}

/**
 * Registra el intento antes de lanzar la peticion y lo actualiza con el
 * resultado. Si el proceso muere en mitad del envio, el intento queda igual
 * registrado en vez de desaparecer.
 */
async function sendAttempt(
  payload: ArchivedTaskPayload,
  attemptNumber: number,
): Promise<AttemptOutcome> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO notification_attempts (task_id, attempt_number)
     VALUES ($1, $2)
     RETURNING id`,
    [payload.taskId, attemptNumber],
  );
  const attemptId = rows[0]!.id;

  let httpStatus: number | null = null;
  let success = false;
  let retryable = true;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(env.notifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      httpStatus = response.status;
      success = response.ok;
      // Se reintenta ante 5xx. Un 4xx es definitivo.
      retryable = response.status >= 500;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    // Sin respuesta: timeout o error de red. http_status se queda en NULL,
    // que es informacion distinta de un 500.
    logger.warn('notificacion sin respuesta', {
      taskId: payload.taskId,
      attemptNumber,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  await query(
    `UPDATE notification_attempts SET http_status = $2, success = $3 WHERE id = $1`,
    [attemptId, httpStatus, success],
  );

  logger.info('intento de notificacion', {
    taskId: payload.taskId,
    attemptNumber,
    httpStatus,
    success,
  });

  return { success, httpStatus, retryable };
}

/** Intentos 2 y 3, con esperas crecientes. */
async function retryInBackground(payload: ArchivedTaskPayload, from: number): Promise<void> {
  for (let attempt = from; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(BACKOFF_MS[attempt - 1] ?? 0);
    const outcome = await sendAttempt(payload, attempt);
    if (outcome.success || !outcome.retryable) return;
  }

  logger.warn('notificacion agotada tras el maximo de intentos', {
    taskId: payload.taskId,
    intentos: MAX_ATTEMPTS,
  });
}

/**
 * Notifica el archivado de una tarea.
 *
 * Se llama siempre DESPUES del commit: un reintento con backoff puede tardar
 * segundos y, dentro de la transaccion, mantendria el lock de la fila
 * bloqueando a todos los demas.
 *
 * Se espera solo al primer intento, que es el caso normal y deja el registro
 * visible de inmediato. Los reintentos siguen en segundo plano para no hacer
 * esperar varios segundos a quien completo su parte.
 */
export async function notifyTaskArchived(payload: ArchivedTaskPayload): Promise<void> {
  const first = await sendAttempt(payload, 1);
  if (first.success || !first.retryable) return;

  void retryInBackground(payload, 2).catch((error) => {
    logger.error('fallo el reintento de notificacion', {
      taskId: payload.taskId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/** GET /tasks/:idTask/notifications */
export async function listAttempts(taskId: number): Promise<NotificationAttemptDTO[]> {
  const { rowCount } = await query(`SELECT 1 FROM tasks WHERE id = $1`, [taskId]);
  if (rowCount === 0) {
    throw new AppError(404, 'TASK_NOT_FOUND', `No existe una tarea con id ${taskId}`);
  }

  const { rows } = await query<NotificationAttemptRow>(
    `SELECT id, task_id, attempt_number, http_status, success, created_at
       FROM notification_attempts
      WHERE task_id = $1
      ORDER BY attempt_number`,
    [taskId],
  );

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    attemptNumber: row.attempt_number,
    httpStatus: row.http_status,
    success: row.success,
    createdAt: row.created_at.toISOString(),
  }));
}
