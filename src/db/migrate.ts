import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool, withTransaction } from './pool';
import { logger } from '../utils/logger';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

/** Aplica en orden alfabetico los .sql pendientes de migrations/. */
export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const done = await appliedMigrations();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !done.has(f));

  if (pending.length === 0) {
    logger.info('No hay migraciones pendientes');
    return;
  }

  for (const file of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    logger.info(`Aplicando migracion ${file}`);
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
  }

  logger.info(`Migraciones aplicadas: ${pending.length}`);
}

if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(async (error) => {
      logger.error('Fallo la migracion', {
        error: error instanceof Error ? error.message : String(error),
      });
      await pool.end().catch(() => undefined);
      process.exit(1);
    });
}
