import { describe, expect, it } from 'vitest';
import {
  merchantOrderNotificationHandler,
  type EmailMessage,
  type EmailSender,
} from '../src/modules/notifications/email.js';

const orderId = '00000000-0000-4000-8000-000000000028';
const ctx = {
  id: '2', topic: 'email.merchant_new_order',
  dedupeKey: `order:${orderId}:merchant_notification`, attempt: 1,
  signal: new AbortController().signal,
};

describe('merchantOrderNotificationHandler', () => {
  it('envía al correo interno configurado y no activa producción', async () => {
    const sent: EmailMessage[] = [];
    const sender: EmailSender = {
      send: (message) => { sent.push(message); return Promise.resolve(); },
    };
    await merchantOrderNotificationHandler(sender, 'ventas@example.com')({ orderId }, ctx);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('ventas@example.com');
    expect(sent[0]?.idempotencyKey).toBe(`order:${orderId}:merchant_notification`);
    expect(sent[0]?.text).toContain('aprobación del arte');
  });

  it('rechaza destinatario y payload inválidos', async () => {
    const sender: EmailSender = { send: () => Promise.resolve() };
    expect(() => merchantOrderNotificationHandler(sender, 'invalid')).toThrow();
    await expect(merchantOrderNotificationHandler(sender, 'ventas@example.com')({ orderId: 'mal' }, ctx)).rejects.toThrow();
  });
});
