-- Forward-only proposal, reviewed by human before production migration.
-- Quote intake stores no payment data; pricing is assigned by a human later.
create table merch_quote_requests (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  contact_email text not null check (char_length(contact_email) between 5 and 320),
  company text,
  product_slug text not null check (char_length(product_slug) between 2 and 160),
  requested_units integer not null check (requested_units between 1 and 1000000),
  specifications text not null check (char_length(specifications) between 10 and 4000),
  status text not null default 'pending_review'
    check (status in ('pending_review','reviewing','quoted','declined','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index merch_quote_requests_created_at_idx on merch_quote_requests (created_at desc);
-- Never expose public SELECT, UPDATE, or DELETE routes without admin auth.
