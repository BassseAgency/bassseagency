import { z } from 'zod';
import type { OutboxHandler } from './outbox.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Clave que el proveedor usa para no enviar dos veces el mismo email. */
  idempotencyKey: string;
}

/**
 * Puerto de envío de email. El proveedor real está pendiente de ADR; su adaptador
 * debe usar `idempotencyKey` y llevar timeout explícito (o respetar `signal`).
 */
export interface EmailSender {
  send(msg: EmailMessage, opts?: { signal?: AbortSignal }): Promise<void>;
}

export interface EmailLogger {
  info(obj: Record<string, unknown>, msg: string): void;
}

/** Oculta la parte local del email para no volcar datos personales en logs. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** Sender de desarrollo: escribe en el log y no envía nada. */
export class LogEmailSender implements EmailSender {
  constructor(private readonly logger: EmailLogger) {}

  send(msg: EmailMessage): Promise<void> {
    this.logger.info(
      { to: maskEmail(msg.to), subject: msg.subject, idempotency_key: msg.idempotencyKey },
      'email (dev, no enviado)',
    );
    return Promise.resolve();
  }
}

export const ORDER_CONFIRMATION_TOPIC = 'email.order_confirmation';

const orderConfirmationPayload = z.object({
  orderId: z.string().min(1),
  email: z.string().email(),
});

/** Handler del topic `email.order_confirmation`. Idempotente vía `order:<orderId>:confirmation`. */
export function orderConfirmationHandler(sender: EmailSender): OutboxHandler {
  return async (payload, ctx) => {
    const parsed = orderConfirmationPayload.safeParse(payload);
    if (!parsed.success) throw new Error('INVALID_PAYLOAD: email.order_confirmation');
    const { orderId, email } = parsed.data;
    await sender.send(
      {
        to: email,
        subject: `Confirmación de tu pedido ${orderId}`,
        text: `Hemos recibido tu pedido ${orderId}. Gracias por tu compra.`,
        idempotencyKey: `order:${orderId}:confirmation`,
      },
      { signal: ctx.signal },
    );
  };
}
