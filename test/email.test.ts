import { describe, expect, it } from 'vitest';
import {
  LogEmailSender,
  maskEmail,
  orderConfirmationHandler,
  type EmailMessage,
  type EmailSender,
} from '../src/modules/notifications/email.js';

const ctx = {
  id: '1',
  topic: 'email.order_confirmation',
  dedupeKey: 'order:o1:confirmation',
  attempt: 1,
  signal: new AbortController().signal,
};

describe('orderConfirmationHandler', () => {
  it('envía con idempotencyKey order:<orderId>:confirmation', async () => {
    const sent: EmailMessage[] = [];
    const sender: EmailSender = {
      send: (msg) => {
        sent.push(msg);
        return Promise.resolve();
      },
    };
    await orderConfirmationHandler(sender)({ orderId: 'o1', email: 'ana@example.com' }, ctx);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('ana@example.com');
    expect(sent[0]?.idempotencyKey).toBe('order:o1:confirmation');
    expect(sent[0]?.text).toContain('o1');
  });

  it('payload inválido falla sin volcar datos', async () => {
    const sender: EmailSender = { send: () => Promise.resolve() };
    await expect(orderConfirmationHandler(sender)({ orderId: 'o1', email: 'no-es-email' }, ctx)).rejects.toThrow(
      /^INVALID_PAYLOAD/,
    );
  });
});

describe('LogEmailSender', () => {
  it('escribe en log con el email enmascarado', async () => {
    const logs: Record<string, unknown>[] = [];
    const sender = new LogEmailSender({ info: (obj) => logs.push(obj) });
    await sender.send({ to: 'ana@example.com', subject: 's', text: 't', idempotencyKey: 'k' });
    expect(logs).toEqual([{ to: 'a***@example.com', subject: 's', idempotency_key: 'k' }]);
  });

  it('maskEmail', () => {
    expect(maskEmail('bob@x.io')).toBe('b***@x.io');
    expect(maskEmail('raro')).toBe('***');
  });
});
