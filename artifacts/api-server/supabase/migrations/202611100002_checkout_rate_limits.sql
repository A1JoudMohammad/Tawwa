CREATE TABLE IF NOT EXISTS public.tawwa_checkout_rate_limits (
  ip_hash text PRIMARY KEY CHECK (ip_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS tawwa_checkout_rate_limits_window_idx
  ON public.tawwa_checkout_rate_limits (window_started_at);

CREATE TABLE IF NOT EXISTS public.tawwa_checkout_rate_limit_attempts (
  ip_hash text NOT NULL
    REFERENCES public.tawwa_checkout_rate_limits(ip_hash) ON DELETE CASCADE,
  idempotency_key_hash text NOT NULL CHECK (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (ip_hash, idempotency_key_hash)
);

CREATE INDEX IF NOT EXISTS tawwa_checkout_rate_limit_attempts_created_at_idx
  ON public.tawwa_checkout_rate_limit_attempts (created_at);

CREATE OR REPLACE FUNCTION public.consume_tawwa_checkout_attempt(
  p_ip_hash text,
  p_idempotency_key_hash text,
  p_max_attempts integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window_started_at timestamptz;
  v_attempt_count integer;
BEGIN
  IF p_ip_hash !~ '^[a-f0-9]{64}$'
     OR p_idempotency_key_hash !~ '^[a-f0-9]{64}$'
     OR p_max_attempts < 1 OR p_max_attempts > 100
     OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid checkout rate-limit arguments';
  END IF;

  -- Expire old fingerprints and counters so this store remains bounded.
  DELETE FROM public.tawwa_checkout_rate_limit_attempts
    WHERE created_at < v_now - interval '1 day';
  DELETE FROM public.tawwa_checkout_rate_limits
    WHERE window_started_at < v_now - interval '1 day';

  INSERT INTO public.tawwa_checkout_rate_limits (ip_hash, window_started_at, attempt_count)
    VALUES (p_ip_hash, v_now, 0)
    ON CONFLICT (ip_hash) DO NOTHING;

  -- Serialize requests for one address. This makes both the limit and retry
  -- exemption correct when several API instances receive requests together.
  SELECT window_started_at, attempt_count
    INTO v_window_started_at, v_attempt_count
    FROM public.tawwa_checkout_rate_limits
    WHERE ip_hash = p_ip_hash
    FOR UPDATE;

  IF v_window_started_at <= v_now - make_interval(secs => p_window_seconds) THEN
    DELETE FROM public.tawwa_checkout_rate_limit_attempts
      WHERE ip_hash = p_ip_hash;
    UPDATE public.tawwa_checkout_rate_limits
      SET window_started_at = v_now, attempt_count = 0
      WHERE ip_hash = p_ip_hash;
    v_attempt_count := 0;
  END IF;

  -- Network retries for a previously admitted request must not spend another
  -- slot, including when they arrive after the address reaches its limit.
  IF EXISTS (
    SELECT 1 FROM public.tawwa_checkout_rate_limit_attempts
      WHERE ip_hash = p_ip_hash
        AND idempotency_key_hash = p_idempotency_key_hash
  ) THEN
    RETURN true;
  END IF;

  IF v_attempt_count >= p_max_attempts THEN
    RETURN false;
  END IF;

  INSERT INTO public.tawwa_checkout_rate_limit_attempts
    (ip_hash, idempotency_key_hash, created_at)
    VALUES (p_ip_hash, p_idempotency_key_hash, v_now);
  UPDATE public.tawwa_checkout_rate_limits
    SET attempt_count = v_attempt_count + 1
    WHERE ip_hash = p_ip_hash;

  RETURN true;
END;
$function$;

ALTER TABLE public.tawwa_checkout_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tawwa_checkout_rate_limit_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tawwa_checkout_rate_limits FROM anon, authenticated;
REVOKE ALL ON TABLE public.tawwa_checkout_rate_limit_attempts FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_tawwa_checkout_attempt(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
