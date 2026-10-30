import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { AppError } from './errors.js';

/** Ámbito de una clave de idempotencia (ADR 0001 §9). */
export interface IdempotencyScope {
  actor: string;
  route: string;
  key: string;
  requestHash: string;
}

/** Respuesta que se guarda y se repite tal cual ante la misma clave. */
export interface StoredResponse<T = unknown> {
  status: number;
  body: T;
}

/** JSON canónico: claves de objeto ordenadas recursivamente; los arrays conservan su orden. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** sha256 (hex) del body canónico. */
export function hashRequest(body: unknown): string {
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}

interface IdempotencyRow {
  request_hash: string;
  status: 'in_progress' | 'completed';
  response_status: number | null;
  response_body: unknown;
}

/**
 * Ejecuta fn una sola vez por (actor, route, key).
 * - Primera vez: fila in_progress → fn → se guarda la respuesta como completed.
 * - Repetición con el mismo hash ya completada: devuelve la respuesta guardada sin ejecutar fn.
 * - Hash distinto: 409 IDEMPOTENCY_KEY_REUSED. Aún en curso: 409 IDEMPOTENCY_IN_PROGRESS.
 * - Si fn lanza, se borra la fila para permitir reintento con la misma clave.
 */
export async function runIdempotent<T>(
  pool: Pool,
  scope: IdempotencyScope,
  fn: () => Promise<StoredResponse<T>>,
): Promise<StoredResponse<T>> {
  const { actor, route, key, requestHash } = scope;
  const inserted = await pool.query(
    `insert into idempotency_requests (actor, route, key, request_hash, status)
     values ($1, $2, $3, $4, 'in_progress')
     on conflict (actor, route, key) do nothing`,
    [actor, route, key, requestHash],
  );

  if (inserted.rowCount !== 1) {
    const { rows } = await pool.query<IdempotencyRow>(
      `select request_hash, status, response_status, response_body
       from idempotency_requests where actor = $1 and route = $2 and key = $3`,
      [actor, route, key],
    );
    const row = rows[0];
    if (row && row.request_hash !== requestHash) {
      throw new AppError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'La clave de idempotencia ya se usó con otra petición');
    }
    if (row?.status !== 'completed' || row.response_status === null) {
      // En curso (o borrada por un fallo concurrente): el cliente debe reintentar más tarde.
      throw new AppError('CONFLICT', 'IDEMPOTENCY_IN_PROGRESS', 'Hay una petición en curso con esta clave');
    }
    return { status: row.response_status, body: row.response_body as T };
  }

  let response: StoredResponse<T>;
  try {
    response = await fn();
  } catch (err) {
    await pool
      .query(
        `delete from idempotency_requests
         where actor = $1 and route = $2 and key = $3 and status = 'in_progress'`,
        [actor, route, key],
      )
      .catch(() => undefined);
    throw err;
  }

  await pool.query(
    `update idempotency_requests
     set status = 'completed', response_status = $4, response_body = $5
     where actor = $1 and route = $2 and key = $3`,
    [actor, route, key, response.status, JSON.stringify(response.body)],
  );
  return response;
}
