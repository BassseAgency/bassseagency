import type { EmailMessage, EmailSender } from './email.js';

/** Adaptador opcional de Resend; credenciales solo en servidor, nunca en la web. */
export const RESEND_SEND_TIMEOUT_MS = 4000;

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey || !from || !from.includes('@')) throw new Error('Resend email no configurado');
  }

  async send(msg: EmailMessage, opts?: { signal?: AbortSignal }): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, RESEND_SEND_TIMEOUT_MS);
    opts?.signal?.addEventListener('abort', abort, { once: true });
    try {
      if (opts?.signal?.aborted) controller.abort();
      const response = await this.fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': msg.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        // No incluir cuerpo de respuesta, datos personales ni API key en errores/logs.
        throw new Error(`EMAIL_DELIVERY_FAILED: HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
      opts?.signal?.removeEventListener('abort', abort);
    }
  }
}
