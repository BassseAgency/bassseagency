import { join } from 'node:path';
import { Pool } from 'pg';
import { migrate } from '../../src/db/migrate.js';

/** URL de la base de tests. Nunca DATABASE_URL: los tests borran el esquema. */
export const testDbUrl = process.env.TEST_DATABASE_URL;

const migrationsDir = join(import.meta.dirname, '..', '..', 'migrations');

/** Crea un pool contra una base limpia con todas las migraciones aplicadas. */
export async function freshDb(): Promise<Pool> {
  if (!testDbUrl) throw new Error('TEST_DATABASE_URL no definida');
  if (!testDbUrl.includes('bassseagency_test') && !process.env.CI) {
    throw new Error('TEST_DATABASE_URL debe apuntar a una base llamada bassseagency_test');
  }
  const pool = new Pool({ connectionString: testDbUrl });
  await pool.query('drop schema public cascade; create schema public;');
  await migrate(pool, migrationsDir);
  return pool;
}

/** Inserta un producto activo con una variante y stock. Devuelve el id de la variante. */
export async function seedVariant(
  pool: Pool,
  opts: { sku: string; priceCents?: number; onHand?: number } = { sku: 'SKU-1' },
): Promise<string> {
  const { rows: p } = await pool.query<{ id: string }>(
    `insert into products (slug, name, status) values ($1, $1, 'active') returning id`,
    [`p-${opts.sku.toLowerCase()}`],
  );
  const { rows: v } = await pool.query<{ id: string }>(
    `insert into product_variants (product_id, sku, name, price_cents) values ($1, $2, $2, $3) returning id`,
    [p[0]?.id, opts.sku, opts.priceCents ?? 1000],
  );
  const variantId = v[0]?.id;
  if (!variantId) throw new Error('seedVariant failed');
  await pool.query('insert into inventory (variant_id, on_hand) values ($1, $2)', [variantId, opts.onHand ?? 10]);
  return variantId;
}
