/** Contrato del proveedor de pagos. El dominio no depende de tipos de Stripe. */

export interface CheckoutLine {
  name: string;
  unitPriceCents: number;
  quantity: number;
}

export interface CreateCheckoutSessionInput {
  orderId: string;
  email: string;
  /** ISO 4217 (p. ej. 'EUR'). */
  currency: string;
  lines: CheckoutLine[];
  /** Se reenvía al proveedor para que reintentos no creen sesiones duplicadas. */
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
  /** Caducidad de la sesión. Debe ser anterior a la de la reserva de stock (si no, se puede pagar sin stock). */
  expiresAt: Date;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/** Evento de webhook ya verificado y normalizado. */
export interface WebhookEvent {
  id: string;
  type: string;
  /** metadata.order_id (o client_reference_id) si el objeto lo trae. */
  orderId: string | null;
  /** payment_status de la Checkout Session, si aplica. */
  paymentStatus: string | null;
  /** Importe total cobrado en céntimos, si aplica (para cuadrar con el pedido). */
  amountTotalCents: number | null;
  /** Moneda en mayúsculas, si aplica. */
  currency: string | null;
}

export interface PaymentProvider {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;
  /** Verifica la firma y normaliza el evento. Lanza AppError VALIDATION (INVALID_SIGNATURE) si no es válida. */
  verifyWebhook(rawBody: string | Buffer, signature: string): WebhookEvent;
}
