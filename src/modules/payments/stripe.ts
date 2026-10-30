import Stripe from 'stripe';
import { AppError } from '../../http/errors.js';
import type {
  CheckoutSession,
  CreateCheckoutSessionInput,
  PaymentProvider,
  WebhookEvent,
} from './provider.js';

/** Timeout explícito por petición a Stripe (AGENTS.md: toda llamada externa lleva timeout). */
export const STRIPE_TIMEOUT_MS = 10_000;
export const STRIPE_MAX_NETWORK_RETRIES = 2;

export interface StripeProviderConfig {
  secretKey: string;
  webhookSecret: string;
}

/** Lee la configuración de STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET. Nunca hay claves en el código. */
export function stripeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StripeProviderConfig {
  const secretKey = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    throw new Error('STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET son obligatorias');
  }
  return { secretKey, webhookSecret };
}

/** Normaliza un evento de Stripe al tipo de dominio. */
export function toWebhookEvent(event: Stripe.Event): WebhookEvent {
  const base: WebhookEvent = {
    id: event.id,
    type: event.type,
    orderId: null,
    paymentStatus: null,
    amountTotalCents: null,
    currency: null,
  };
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed': {
      const s = event.data.object;
      return {
        ...base,
        orderId: s.metadata?.order_id ?? s.client_reference_id,
        paymentStatus: s.payment_status,
        amountTotalCents: s.amount_total,
        currency: s.currency?.toUpperCase() ?? null,
      };
    }
    case 'charge.refunded': {
      const c = event.data.object;
      return { ...base, orderId: c.metadata.order_id ?? null };
    }
    case 'charge.dispute.created': {
      const d = event.data.object;
      return { ...base, orderId: d.metadata.order_id ?? null };
    }
    default:
      return base;
  }
}

/** Verifica firma con el SDK oficial; cualquier fallo es 400 sin detalle interno. */
export function verifyStripeSignature(rawBody: string | Buffer, signature: string, webhookSecret: string): WebhookEvent {
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    throw new AppError('VALIDATION', 'INVALID_SIGNATURE', 'Firma de webhook inválida');
  }
  return toWebhookEvent(event);
}

export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe;

  constructor(private readonly config: StripeProviderConfig) {
    this.stripe = new Stripe(config.secretKey, {
      timeout: STRIPE_TIMEOUT_MS,
      maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
    });
  }

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    const metadata = { order_id: input.orderId };
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: input.orderId,
        customer_email: input.email,
        metadata,
        // Para que los eventos de cargo (refund/dispute) también lleven el pedido.
        payment_intent_data: { metadata },
        line_items: input.lines.map((l) => ({
          quantity: l.quantity,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: l.unitPriceCents,
            product_data: { name: l.name },
          },
        })),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!session.url) throw new Error('Stripe no devolvió URL de checkout');
    return { id: session.id, url: session.url };
  }

  verifyWebhook(rawBody: string | Buffer, signature: string): WebhookEvent {
    return verifyStripeSignature(rawBody, signature, this.config.webhookSecret);
  }
}
