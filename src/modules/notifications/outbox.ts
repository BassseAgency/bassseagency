import type { Pool } from 'pg';

/*
 * Procesador del transactional outbox (ADR 0001, §9 y §15).
 *
 * Entrega AT-LEAST-ONCE: un mensaje puede ejecutarse más de una vez (caída del worker
 * tras el efecto y antes de marcar 'sent', lease caducado, timeout que no detiene el
 * efecto...). Por eso los handlers DEBEN ser idempotentes: usan `ctx.dedupeKey` (la
 * `dedupe_key` de la fila) o una clave derivada del payload como clave de idempotencia
 * frente al proveedor externo.
 */

export interface OutboxHandlerContext {
  id: string;
  topic: string;
  /** `dedupe_key` de la fila: base para la clave de idempotencia del efecto externo. */
  dedupeKey: string;
  /** Número de intento, empezando en 1. */
  attempt: number;
  /** Se aborta al vencer el timeout del handler. */
  signal: AbortSignal;
}

export type OutboxHandler = (payload: unknown, ctx: OutboxHandlerContext) => Promise<void>;

export interface ProcessOutboxOptions {
  batchSize: number;
  /** Duración del lease. Debe ser mayor que handlerTimeoutMs. */
  lockMs: number;
  maxAttempts: number;
  handlerTimeoutMs: number;
  now?: () => Date;
  random?: () => number;
}

export interface ProcessOutboxResult {
  claimed: number;
  sent: number;
  /** Fallos con reintento programado. */
  failed: number;
  /** Fallos que agotaron intentos y pasan a 'dead'. */
  dead: number;
}

interface OutboxRow {
  id: string;
  topic: string;
  dedupe_key: string;
  payload: unknown;
  attempts: number;
}

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 15 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;

/** Backoff exponencial con jitter ("equal jitter"): entre la mitad y el total del retardo. */
export function computeBackoffMs(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  const r = Math.min(1, Math.max(0, random()));
  return Math.round(exp / 2 + (exp / 2) * r);
}

class OutboxError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Mensaje de error apto para guardar: sin secretos ni emails y truncado. */
export function sanitizeError(err: unknown): string {
  let msg: string;
  if (err instanceof OutboxError) msg = `${err.code}: ${err.message}`;
  else if (err instanceof Error) msg = `${err.name}: ${err.message}`;
  else msg = String(err);
  msg = msg
    .replace(/\b(sk|rk|pk|whsec)_(live|test)_[A-Za-z0-9]+/g, '[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(password|passwd|secret|token|api[_-]?key|authorization)(\s*[=:]\s*)\S+/gi, '$1$2[REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
    .replace(/:\/\/[^/\s:@]+:[^/\s@]+@/g, '://[REDACTED]@');
  return msg.length > MAX_ERROR_LENGTH ? `${msg.slice(0, MAX_ERROR_LENGTH - 1)}…` : msg;
}

async function runWithTimeout(
  handler: OutboxHandler,
  row: OutboxRow,
  timeoutMs: number,
): Promise<void> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new OutboxError('HANDLER_TIMEOUT', `handler excedió ${String(timeoutMs)} ms`));
    }, timeoutMs);
  });
  try {
    await Promise.race([
      handler(row.payload, {
        id: row.id,
        topic: row.topic,
        dedupeKey: row.dedupe_key,
        attempt: row.attempts + 1,
        signal: controller.signal,
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reclama un lote de mensajes pendientes con lease, ejecuta sus handlers en paralelo
 * y registra el resultado. Seguro con varios workers concurrentes (SKIP LOCKED + lease).
 */
export async function processOutboxBatch(
  pool: Pool,
  handlers: Record<string, OutboxHandler>,
  opts: ProcessOutboxOptions,
): Promise<ProcessOutboxResult> {
  if (opts.lockMs <= opts.handlerTimeoutMs) {
    throw new Error('lockMs debe ser mayor que handlerTimeoutMs');
  }
  const now = opts.now ?? (() => new Date());
  const random = opts.random ?? Math.random;

  const claimedAt = now();
  const lease = new Date(claimedAt.getTime() + opts.lockMs);
  const { rows } = await pool.query<OutboxRow>(
    `update outbox set locked_until = $2
     where id in (
       select id from outbox
       where status = 'pending' and next_attempt_at <= $1
         and (locked_until is null or locked_until < $1)
       order by id
       limit $3
       for update skip locked
     )
     returning id::text, topic, dedupe_key, payload, attempts`,
    [claimedAt, lease, opts.batchSize],
  );

  const result: ProcessOutboxResult = { claimed: rows.length, sent: 0, failed: 0, dead: 0 };

  const outcomes = await Promise.allSettled(
    rows.map(async (row) => {
      let error: unknown = undefined;
      let ok = true;
      try {
        const handler = Object.hasOwn(handlers, row.topic) ? handlers[row.topic] : undefined;
        if (!handler) throw new OutboxError('NO_HANDLER', `sin handler para el topic ${row.topic}`);
        await runWithTimeout(handler, row, opts.handlerTimeoutMs);
      } catch (err) {
        ok = false;
        error = err;
      }

      // Las actualizaciones exigen seguir teniendo el lease: si caducó, otro worker puede
      // haber reclamado la fila y no debemos pisar su resultado.
      if (ok) {
        const { rowCount } = await pool.query(
          `update outbox set status = 'sent', sent_at = $2, locked_until = null, last_error = null
           where id = $1 and status = 'pending' and locked_until = $3`,
          [row.id, now(), lease],
        );
        if (rowCount === 1) result.sent += 1;
        return;
      }

      const attempts = row.attempts + 1;
      const isDead = attempts >= opts.maxAttempts;
      const nextAttempt = new Date(now().getTime() + computeBackoffMs(attempts, random));
      const { rowCount } = await pool.query(
        `update outbox set attempts = $2, last_error = $3, next_attempt_at = $4,
           locked_until = null, status = $5
         where id = $1 and status = 'pending' and locked_until = $6`,
        [row.id, attempts, sanitizeError(error), nextAttempt, isDead ? 'dead' : 'pending', lease],
      );
      if (rowCount !== 1) return;
      if (isDead) result.dead += 1;
      else result.failed += 1;
    }),
  );

  // Un fallo de BD al registrar el resultado no debe ocultarse; la fila se reintentará al caducar el lease.
  const rejected = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected');
  if (rejected) throw rejected.reason;

  return result;
}
