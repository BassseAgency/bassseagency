-- 0004_orders_payment_intent: enlaza el pedido con el payment_intent de Stripe (issue #7).
-- Expand puro: columna nullable. Permite resolver charge.refunded y charge.dispute.created
-- aunque el evento no traiga metadata.order_id. Unique: un payment_intent pertenece a un pedido.
alter table orders add column stripe_payment_intent_id text unique;
