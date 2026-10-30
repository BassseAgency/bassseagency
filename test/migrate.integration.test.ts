import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';

// Test de integración. Usa TEST_DATABASE_URL, nunca DATABASE_URL: el test borra el esquema public.
const url = process.env.TEST_DATABASE_URL;
const migrationsDir = join(import.meta.dirname, '..', 'migrations');

describe.skipIf(!url)('migraciones contra Postgres real', () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!url?.includes('bassseagency_test') && !process.env.CI) {
      throw new Error('TEST_DATABASE_URL debe apuntar a una base llamada bassseagency_test');
    }
    pool = new Pool({ connectionString: url });
    await pool.query('drop schema public cascade; create schema public;');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('aplica las migraciones una vez y es idempotente al repetir', async () => {
    const first = await migrate(pool, migrationsDir);
    expect(first.applied).toContain('0001_baseline.sql');

    const second = await migrate(pool, migrationsDir);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toContain('0001_baseline.sql');

    const { rows } = await pool.query<{ version: string }>('select version from schema_migrations');
    expect(rows.map((r) => r.version)).toContain('0001_baseline.sql');
  });
});
