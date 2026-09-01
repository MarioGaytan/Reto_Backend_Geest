import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env, isProduction } from '../config/env';
import { logger } from '../utils/logger';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: isProduction ? 20 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error('Error inesperado en un cliente idle del pool', { error: err.message });
});

/** Ejecuta una query usando un cliente del pool. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params as unknown[]);
  logger.debug('query', { text, ms: Date.now() - start, rows: result.rowCount });
  return result;
}

/**
 * Ejecuta un callback dentro de una transaccion.
 * Hace COMMIT si resuelve y ROLLBACK si lanza.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Describe el destino de la conexion sin exponer la contrasena. */
export function describeTarget(): string {
  try {
    const url = new URL(env.databaseUrl);
    return `${url.hostname}:${url.port || '5432'}${url.pathname} (usuario: ${url.username})`;
  } catch {
    return '(DATABASE_URL con formato invalido)';
  }
}

/** Verifica que la base de datos responde. */
export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    logger.error('No se pudo conectar a PostgreSQL', {
      error: error instanceof Error ? error.message : String(error),
      target: describeTarget(),
      hint: 'Levanta la base con `docker compose up -d` y revisa DATABASE_URL en .env',
    });
    return false;
  }
}

/** Cierra el pool (shutdown / teardown de tests). */
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('Pool de PostgreSQL cerrado');
}
