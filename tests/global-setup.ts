import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

config({ path: '.env.test', override: true });

/**
 * Recrea la base de datos de pruebas desde cero y aplica las migraciones.
 *
 * Se usa una base aparte (geest_test) para no tocar los datos de desarrollo,
 * y se recrea entera en cada ejecucion para que la suite arranque siempre
 * desde el mismo estado.
 */
export default async function globalSetup(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL!);
  const testDb = url.pathname.slice(1);

  const maintenanceUrl = new URL(url.toString());
  maintenanceUrl.pathname = '/postgres';

  const admin = new Client({ connectionString: maintenanceUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${testDb}`);
  await admin.end();

  const db = new Client({ connectionString: url.toString() });
  await db.connect();

  const dir = join(__dirname, '..', 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.query(readFileSync(join(dir, file), 'utf8'));
  }

  await db.end();
}
