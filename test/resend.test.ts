import { describe, expect, it } from 'vitest';
import { ResendEmailSender } from '../src/modules/notifications/resend.js';

const msg = {
  to: 'cliente@example.com',
  subject: 'Pedido confirmado',
  text: 'Pedido demo',
  idempotencyKey: 'order:demo:confirmation',
};

describe('ResendEmailSender', () => {
  it('envía un payload seguro y usa la clave idempotente', async () => {
    let headers: Headers | undefined;
    let payload: unknown;
    const fetcher: typeof fetch = async (_url, init) => {
      headers = new Headers(init?.headers);
      payload = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_test' }), { status: 200 });
    };
    const sender = new ResendEmailSender('re_test_placeholder', 'BASSSE <ventas@example.com>', fetcher);
    await sender.send(msg);
    expect(headers?.get('Idempotency-Key')).toBe(msg.idempotencyKey);
    expect(headers?.get('Authorization')).toBe('Bearer re_test_placeholder');
    expect(payload).toEqual({
      from: 'BASSSE <ventas@example.com>',
      to: ['cliente@example.com'],
      subject: 'Pedido confirmado',
      text: 'Pedido demo',
    });
  });

  it('reporta fallo de entrega sin filtrar claves ni cuerpo de error', async () => {
    const fetcher: typeof fetch = async () => new Response('unexpected sensitive data', { status: 503 });
    const sender = new ResendEmailSender('re_test_secret', 'ventas@example.com', fetcher);
    await expect(sender.send(msg)).rejects.toThrow('EMAIL_DELIVERY_FAILED: HTTP 503');
    await expect(sender.send(msg)).rejects.not.toThrow('re_test_secret');
  });

  it('rechaza configuración parcial', () => {
    expect(() => new ResendEmailSender('', 'ventas@example.com')).toThrow();
    expect(() => new ResendEmailSender('re_test_secret', '')).toThrow();
  });
});
