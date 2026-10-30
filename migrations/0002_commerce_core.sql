-- 0002_commerce_core: núcleo del flujo de compra.
-- Dinero siempre en céntimos (integer) + moneda ISO 4217. Nunca float.
-- Ver ADR 0001 §9 (idempotencia) y §15 (modos de fallo).

create table products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null default '',
  status      text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id),
  sku         text not null unique,
  name        text not null,
  price_cents integer not null check (price_cents >= 0),
  currency    char(3) not null default 'EUR',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index product_variants_product_id_idx on product_variants(product_id);

-- Stock: on_hand físico, reserved comprometido por checkouts en curso.
-- Disponible = on_hand - reserved. Los CHECK impiden stock negativo y sobre-reserva.
create table inventory (
  variant_id uuid primary key references product_variants(id),
  on_hand    integer not null default 0 check (on_hand >= 0),
  reserved   integer not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  check (reserved <= on_hand)
);

create table carts (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table cart_items (
  cart_id    uuid not null references carts(id) on delete cascade,
  variant_id uuid not null references product_variants(id),
  quantity   integer not null check (quantity > 0),
  primary key (cart_id, variant_id)
);

-- Pedido: se crea en pending_payment ANTES de ir a Stripe. Solo un webhook firmado lo pasa a paid.
-- version permite optimistic locking; las transiciones son monotónicas (se aplican en código).
create table orders (
  id                         uuid primary key default gen_random_uuid(),
  status                     text not null default 'pending_payment'
                               check (status in ('pending_payment', 'paid', 'cancelled', 'refunded', 'disputed')),
  email                      text not null,
  currency                   char(3) not null,
  total_cents                integer not null check (total_cents >= 0),
  stripe_checkout_session_id text unique,
  version                    integer not null default 0,
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create index orders_status_created_at_idx on orders(status, created_at);

-- Snapshot de precio y nombre en el momento de la compra (precios históricos).
create table order_items (
  order_id         uuid not null references orders(id),
  variant_id       uuid not null references product_variants(id),
  sku              text not null,
  name             text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity         integer not null check (quantity > 0),
  primary key (order_id, variant_id)
);

create table stock_reservations (
  order_id   uuid not null references orders(id),
  variant_id uuid not null references product_variants(id),
  quantity   integer not null check (quantity > 0),
  status     text not null default 'active' check (status in ('active', 'committed', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (order_id, variant_id)
);
create index stock_reservations_active_expiry_idx on stock_reservations(expires_at) where status = 'active';

-- Idempotencia de peticiones: misma clave + mismo payload => misma respuesta; payload distinto => 409.
create table idempotency_requests (
  actor           text not null,
  route           text not null,
  key             text not null,
  request_hash    text not null,
  status          text not null check (status in ('in_progress', 'completed')),
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz not null default now(),
  primary key (actor, route, key)
);

-- Deduplicación de webhooks. Se inserta en la misma transacción que aplica el efecto.
create table processed_events (
  provider     text not null,
  event_id     text not null,
  processed_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- Transactional outbox para efectos externos (emails, etc.).
create table outbox (
  id              bigint generated always as identity primary key,
  topic           text not null,
  dedupe_key      text not null unique,
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'dead')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index outbox_pending_idx on outbox(next_attempt_at) where status = 'pending';

create table audit_logs (
  id         bigint generated always as identity primary key,
  actor      text not null,
  action     text not null,
  resource   text not null,
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_resource_idx on audit_logs(resource, created_at);
