import type {
  CheckoutSession,
  CreateCheckoutSessionInput,
  PaymentProvider,
  WebhookEvent,
} from './provider.js';
import { verifyStripeSignature } from './stripe.js';

/**
 * Proveedor falso para tests: no hace llamadas de red.
 * La verificación de webhooks usa el mismo algoritmo de firma que Stripe (sin red).
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly calls: CreateCheckoutSessionInput[] = [];
  /** Si se define, createCheckoutSession lanza este error. */
  failWith: Error | null = null;

  constructor(private readonly webhookSecret: string) {}

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    this.calls.push(input);
    if (this.failWith) return Promise.reject(this.failWith);
    const id = `cs_test_${String(this.calls.length)}_${input.orderId}`;
    return Promise.resolve({ id, url: `https://checkout.stripe.test/${id}` });
  }

  verifyWebhook(rawBody: string | Buffer, signature: string): WebhookEvent {
    return verifyStripeSignature(rawBody, signature, this.webhookSecret);
  }
}
