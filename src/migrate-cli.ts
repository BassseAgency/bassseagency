import { join } from 'node:path';
import { Pool } from 'pg';
import { migrate } from './db/migrate.js';

// Migraciones como paso de despliegue (npm run migrate), no en cada arranque en frío de una función.
// Conexión directa si existe: el advisory lock del runner es de sesión.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_UNPOOLED o DATABASE_URL es obligatoria');
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5000 });
try {
  const result = await migrate(pool, join(import.meta.dirname, '..', 'migrations'));
  console.log(JSON.stringify(result));
} finally {
  await pool.end();
}
