import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';

// Clave fija del advisory lock: evita que dos despliegues migren a la vez.
const MIGRATION_LOCK_KEY = 738_201;

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Aplica migraciones SQL forward-only en orden lexicográfico.
 * Cada migración corre en su propia transacción y se registra en schema_migrations,
 * así que re-ejecutar es seguro (idempotente).
 */
export async function migrate(pool: Pool, migrationsDir: string): Promise<MigrationResult> {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      create table if not exists schema_migrations (
        version    text primary key,
        applied_at timestamptz not null default now()
      )`);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    const result: MigrationResult = { applied: [], skipped: [] };

    for (const file of files) {
      const { rows } = await client.query<{ version: string }>(
        'select version from schema_migrations where version = $1',
        [file],
      );
      if (rows.length > 0) {
        result.skipped.push(file);
        continue;
      }
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      await applyOne(client, file, sql);
      result.applied.push(file);
    }
    return result;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

async function applyOne(client: PoolClient, version: string, sql: string): Promise<void> {
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('insert into schema_migrations (version) values ($1)', [version]);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw new Error(`migration ${version} failed: ${(err as Error).message}`);
  }
}
