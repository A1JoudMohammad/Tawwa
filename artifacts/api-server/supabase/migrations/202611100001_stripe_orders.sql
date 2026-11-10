CREATE TABLE IF NOT EXISTS public.tawwa_orders (
  id uuid PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  order_access_token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  currency text NOT NULL DEFAULT 'kwd' CHECK (currency = 'kwd'),
  subtotal_minor integer NOT NULL CHECK (subtotal_minor >= 0),
  delivery_fee_minor integer NOT NULL CHECK (delivery_fee_minor >= 0),
  total_minor integer NOT NULL CHECK (total_minor = subtotal_minor + delivery_fee_minor),
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  customer jsonb NOT NULL CHECK (jsonb_typeof(customer) = 'object'),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS tawwa_orders_created_at_idx
  ON public.tawwa_orders (created_at DESC);

ALTER TABLE public.tawwa_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tawwa_orders FROM anon, authenticated;
