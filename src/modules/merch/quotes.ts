import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const requestSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().email().max(320),
  company: z.string().trim().max(160).optional(),
  productSlug: z.string().trim().min(2).max(160).regex(/^[a-z0-9][a-z0-9-]*$/),
  requestedUnits: z.number().int().min(1).max(1000000),
  specifications: z.string().trim().min(10).max(4000),
}).strict();

/**
 * Quote-only intake. Never initiate Checkout or claim a price was approved.
 * No public reading endpoints. Must remain disabled until abuse protection,
 * privacy notices and fulfillment operations are ready.
 */
export function registerMerchQuoteIntake(app: FastifyInstance, db: Pool): void {
  app.post('/merch/quote-requests', async (req, reply) => {
    const input = requestSchema.parse(req.body);
    const { rows } = await db.query<{ id: string; status: string }>(
      `insert into merch_quote_requests
       (contact_name, contact_email, company, product_slug, requested_units, specifications)
       values ($1, $2, $3, $4, $5, $6)
       returning id, status`,
      [input.contactName, input.contactEmail, input.company ?? null,
       input.productSlug, input.requestedUnits, input.specifications],
    );
    return reply.code(201).send({
      id: rows[0]?.id,
      status: rows[0]?.status,
      message: 'Solicitud registrada; presupuesto pendiente de confirmación.',
    });
  });
}
