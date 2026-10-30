import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/** Taxonomía de errores (ADR 0001). El código va al cliente; el detalle interno, solo a logs. */
export type ErrorCategory =
  | 'VALIDATION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMIT'
  | 'PAYMENT'
  | 'INTEGRATION'
  | 'DATABASE'
  | 'INTERNAL';

const STATUS: Record<ErrorCategory, number> = {
  VALIDATION: 400,
  AUTHENTICATION: 401,
  AUTHORIZATION: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMIT: 429,
  PAYMENT: 402,
  INTEGRATION: 502,
  DATABASE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    readonly category: ErrorCategory,
    /** Código específico, p. ej. PRODUCT_NOT_FOUND. */
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
  get status(): number {
    return STATUS[this.category];
  }
}

/** Respuesta estándar: { error: { code, message, request_id, details? } }. Nunca expone stack ni secretos. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ err }, err.message);
      return reply.code(err.status).send({
        error: { code: err.code, message: err.message, request_id: req.id, details: err.details },
      });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: { code: 'VALIDATION', message: 'Petición inválida', request_id: req.id, details: err.issues },
      });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({
      error: { code: 'INTERNAL', message: 'Error interno', request_id: req.id },
    });
  });
}
