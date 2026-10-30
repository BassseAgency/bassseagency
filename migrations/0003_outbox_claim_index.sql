-- 0003_outbox_claim_index: índice parcial para el reclamo del outbox (issue #9).
-- La consulta filtra por status, next_attempt_at y locked_until, y ordena por id.
-- Solo indexa filas pendientes: las enviadas y muertas no entran en el índice.
-- Sin CONCURRENTLY: bloquea escrituras en outbox mientras se construye. Aceptable en esta
-- fase por el tamaño de la tabla; si crece, usar CREATE INDEX CONCURRENTLY en una migración aparte.
create index outbox_claim_idx on outbox (next_attempt_at, locked_until, id) where status = 'pending';
