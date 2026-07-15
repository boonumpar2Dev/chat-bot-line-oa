
-- ============================================================
-- Phase 3.2A: Durable AI reply batching foundation
-- ============================================================
-- Feature flag on app_settings (JSONB, default OFF, isolated from live_rollout)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS durable_ai_batching_config jsonb NOT NULL DEFAULT jsonb_build_object(
    'enabled', false,
    'test_customer_ids', '[]'::jsonb,
    'quiet_window_seconds', 8,
    'claim_batch_size', 10,
    'claim_lease_seconds', 120,
    'max_retry_count', 3,
    'completed_retention_days', 30,
    'cancelled_retention_days', 30,
    'failed_retention_days', 90
  );

-- ============================================================
-- Table: ai_reply_batches
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_reply_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  batch_start_at timestamptz NOT NULL,
  last_customer_message_at timestamptz NOT NULL,
  reply_after timestamptz NOT NULL,
  latest_line_message_id text NOT NULL,
  batch_version bigint NOT NULL DEFAULT 1,
  status text NOT NULL,
  claim_token uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  processing_started_at timestamptz,
  sending_started_at timestamptz,
  processed_at timestamptz,
  reply_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  reply_text text,
  reply_payload jsonb,
  line_push_idempotency_key uuid UNIQUE,
  push_started_at timestamptz,
  line_response_status integer,
  line_request_id text,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  cancelled_reason text,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_reply_batches_status_valid
    CHECK (status IN ('pending','processing','sending','completed','cancelled','failed')),
  CONSTRAINT ai_reply_batches_version_positive CHECK (batch_version >= 1),
  CONSTRAINT ai_reply_batches_retry_nonneg CHECK (retry_count >= 0),
  CONSTRAINT ai_reply_batches_reply_after_ok CHECK (reply_after >= batch_start_at),
  CONSTRAINT ai_reply_batches_claim_consistency CHECK (
    (status = 'processing' AND claim_token IS NOT NULL AND claimed_at IS NOT NULL AND claim_expires_at IS NOT NULL)
    OR (status <> 'processing')
  ),
  CONSTRAINT ai_reply_batches_sending_needs_idem CHECK (
    status <> 'sending' OR line_push_idempotency_key IS NOT NULL
  ),
  CONSTRAINT ai_reply_batches_completed_needs_processed CHECK (
    status <> 'completed' OR processed_at IS NOT NULL
  ),
  CONSTRAINT ai_reply_batches_cancelled_needs_reason CHECK (
    status <> 'cancelled' OR (cancelled_reason IS NOT NULL AND length(cancelled_reason) > 0)
  ),
  CONSTRAINT ai_reply_batches_failed_needs_error CHECK (
    status <> 'failed' OR (failed_at IS NOT NULL AND last_error IS NOT NULL)
  )
);

GRANT SELECT ON public.ai_reply_batches TO authenticated;
GRANT ALL ON public.ai_reply_batches TO service_role;
ALTER TABLE public.ai_reply_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "batches_read_staff" ON public.ai_reply_batches;
CREATE POLICY "batches_read_staff" ON public.ai_reply_batches
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_batches_due_pending
  ON public.ai_reply_batches (reply_after, id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_batches_stale_processing
  ON public.ai_reply_batches (claim_expires_at, id) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_batches_customer_created
  ON public.ai_reply_batches (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_cleanup_completed
  ON public.ai_reply_batches (processed_at) WHERE status IN ('completed','cancelled');
CREATE INDEX IF NOT EXISTS idx_batches_cleanup_failed
  ON public.ai_reply_batches (failed_at) WHERE status = 'failed';

-- Partial unique: at most ONE active receiving batch per customer (pending OR processing).
-- 'sending' intentionally excluded so a new pending batch can coexist with a sending one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_one_active_receiving_per_customer
  ON public.ai_reply_batches (customer_id) WHERE status IN ('pending','processing');

-- ============================================================
-- Table: ai_reply_batch_messages (child)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_reply_batch_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.ai_reply_batches(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  line_message_id text NOT NULL,
  message_text text NOT NULL,
  customer_message_at timestamptz NOT NULL,
  sequence_no bigserial NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_batch_messages_line_message_id UNIQUE (line_message_id),
  CONSTRAINT uq_batch_messages_conversation_id UNIQUE (conversation_id)
);

GRANT SELECT ON public.ai_reply_batch_messages TO authenticated;
GRANT ALL ON public.ai_reply_batch_messages TO service_role;
ALTER TABLE public.ai_reply_batch_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "batch_msgs_read_staff" ON public.ai_reply_batch_messages;
CREATE POLICY "batch_msgs_read_staff" ON public.ai_reply_batch_messages
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_batch_messages_ordering
  ON public.ai_reply_batch_messages (batch_id, customer_message_at ASC, sequence_no ASC);
CREATE INDEX IF NOT EXISTS idx_batch_messages_customer
  ON public.ai_reply_batch_messages (customer_id, customer_message_at DESC);

-- updated_at trigger for batches
DROP TRIGGER IF EXISTS trg_ai_reply_batches_updated_at ON public.ai_reply_batches;
CREATE TRIGGER trg_ai_reply_batches_updated_at
  BEFORE UPDATE ON public.ai_reply_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RPC: enqueue_ai_reply_message
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_ai_reply_message(
  p_conversation_id uuid,
  p_quiet_window_seconds integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
  v_batch RECORD;
  v_existing RECORD;
  v_quiet_s integer;
  v_reply_after timestamptz;
  v_batch_id uuid;
  v_new_version bigint;
  v_cfg jsonb;
BEGIN
  -- Load and verify conversation
  SELECT id, customer_id, sender::text AS sender, line_message_id, message, created_at
    INTO v_conv
    FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found';
  END IF;
  IF v_conv.sender <> 'customer' THEN
    RAISE EXCEPTION 'sender_not_customer';
  END IF;
  IF v_conv.line_message_id IS NULL OR length(v_conv.line_message_id) = 0 THEN
    RAISE EXCEPTION 'missing_line_message_id';
  END IF;
  IF v_conv.customer_id IS NULL THEN
    RAISE EXCEPTION 'missing_customer_id';
  END IF;

  -- Determine quiet window
  IF p_quiet_window_seconds IS NULL OR p_quiet_window_seconds < 1 OR p_quiet_window_seconds > 300 THEN
    SELECT durable_ai_batching_config INTO v_cfg FROM public.app_settings LIMIT 1;
    v_quiet_s := COALESCE((v_cfg->>'quiet_window_seconds')::int, 8);
  ELSE
    v_quiet_s := p_quiet_window_seconds;
  END IF;
  IF v_quiet_s < 1 THEN v_quiet_s := 1; END IF;
  IF v_quiet_s > 300 THEN v_quiet_s := 300; END IF;

  v_reply_after := v_conv.created_at + make_interval(secs => v_quiet_s);

  -- Idempotent dedupe by line_message_id
  SELECT m.batch_id, b.status, b.batch_version, b.reply_after
    INTO v_existing
    FROM public.ai_reply_batch_messages m
    JOIN public.ai_reply_batches b ON b.id = m.batch_id
    WHERE m.line_message_id = v_conv.line_message_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'batch_id', v_existing.batch_id,
      'batch_version', v_existing.batch_version,
      'status', v_existing.status,
      'reply_after', v_existing.reply_after,
      'duplicate', true
    );
  END IF;

  -- Lock active receiving batch (pending OR processing) for this customer
  SELECT * INTO v_batch
    FROM public.ai_reply_batches
    WHERE customer_id = v_conv.customer_id
      AND status IN ('pending','processing')
    ORDER BY created_at DESC
    FOR UPDATE
    LIMIT 1;

  IF NOT FOUND THEN
    -- Create new pending batch
    INSERT INTO public.ai_reply_batches (
      customer_id, batch_start_at, last_customer_message_at, reply_after,
      latest_line_message_id, status, batch_version
    ) VALUES (
      v_conv.customer_id, v_conv.created_at, v_conv.created_at, v_reply_after,
      v_conv.line_message_id, 'pending', 1
    ) RETURNING id, batch_version, status, reply_after INTO v_batch_id, v_new_version, v_existing.status, v_existing.reply_after;

    BEGIN
      INSERT INTO public.ai_reply_batch_messages (
        batch_id, customer_id, conversation_id, line_message_id, message_text, customer_message_at
      ) VALUES (
        v_batch_id, v_conv.customer_id, v_conv.id, v_conv.line_message_id,
        COALESCE(v_conv.message, ''), v_conv.created_at
      );
    EXCEPTION WHEN unique_violation THEN
      -- Race: another tx just inserted this same message; resolve idempotently
      SELECT m.batch_id, b.status, b.batch_version, b.reply_after
        INTO v_existing
        FROM public.ai_reply_batch_messages m
        JOIN public.ai_reply_batches b ON b.id = m.batch_id
        WHERE m.line_message_id = v_conv.line_message_id;
      RETURN jsonb_build_object(
        'batch_id', v_existing.batch_id, 'batch_version', v_existing.batch_version,
        'status', v_existing.status, 'reply_after', v_existing.reply_after, 'duplicate', true
      );
    END;

    RETURN jsonb_build_object(
      'batch_id', v_batch_id, 'batch_version', v_new_version,
      'status', 'pending', 'reply_after', v_existing.reply_after, 'duplicate', false
    );
  END IF;

  -- Existing active batch: append
  BEGIN
    INSERT INTO public.ai_reply_batch_messages (
      batch_id, customer_id, conversation_id, line_message_id, message_text, customer_message_at
    ) VALUES (
      v_batch.id, v_conv.customer_id, v_conv.id, v_conv.line_message_id,
      COALESCE(v_conv.message, ''), v_conv.created_at
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT m.batch_id, b.status, b.batch_version, b.reply_after
      INTO v_existing
      FROM public.ai_reply_batch_messages m
      JOIN public.ai_reply_batches b ON b.id = m.batch_id
      WHERE m.line_message_id = v_conv.line_message_id;
    RETURN jsonb_build_object(
      'batch_id', v_existing.batch_id, 'batch_version', v_existing.batch_version,
      'status', v_existing.status, 'reply_after', v_existing.reply_after, 'duplicate', true
    );
  END;

  -- Update batch: bump version, refresh timers, and if processing → revert to pending & clear claim (fence out worker)
  UPDATE public.ai_reply_batches
    SET last_customer_message_at = GREATEST(last_customer_message_at, v_conv.created_at),
        reply_after = GREATEST(reply_after, v_reply_after),
        latest_line_message_id = CASE
          WHEN v_conv.created_at >= last_customer_message_at THEN v_conv.line_message_id
          ELSE latest_line_message_id END,
        batch_version = batch_version + 1,
        status = CASE WHEN status = 'processing' THEN 'pending' ELSE status END,
        claim_token = CASE WHEN status = 'processing' THEN NULL ELSE claim_token END,
        claimed_at = CASE WHEN status = 'processing' THEN NULL ELSE claimed_at END,
        claim_expires_at = CASE WHEN status = 'processing' THEN NULL ELSE claim_expires_at END,
        processing_started_at = CASE WHEN status = 'processing' THEN NULL ELSE processing_started_at END
    WHERE id = v_batch.id
    RETURNING id, batch_version, status, reply_after
    INTO v_batch_id, v_new_version, v_existing.status, v_existing.reply_after;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id, 'batch_version', v_new_version,
    'status', v_existing.status, 'reply_after', v_existing.reply_after, 'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_ai_reply_message(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ai_reply_message(uuid, integer) TO service_role;

-- ============================================================
-- RPC: claim_due_batches
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_due_batches(
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 120
) RETURNS TABLE (
  batch_id uuid,
  customer_id uuid,
  claim_token uuid,
  batch_version bigint,
  latest_line_message_id text,
  reply_after timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 10), 100));
  v_lease int := GREATEST(10, LEAST(COALESCE(p_lease_seconds, 120), 900));
  v_now timestamptz := now();
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT b.id
      FROM public.ai_reply_batches b
      WHERE b.status = 'pending' AND b.reply_after <= v_now
      ORDER BY b.reply_after ASC, b.id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT v_limit
  ), upd AS (
    UPDATE public.ai_reply_batches b
      SET status = 'processing',
          claim_token = gen_random_uuid(),
          claimed_at = v_now,
          claim_expires_at = v_now + make_interval(secs => v_lease),
          processing_started_at = v_now,
          batch_version = b.batch_version + 1
      FROM due
      WHERE b.id = due.id
      RETURNING b.id, b.customer_id, b.claim_token, b.batch_version, b.latest_line_message_id, b.reply_after
  )
  SELECT * FROM upd;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_batches(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_batches(integer, integer) TO service_role;

-- ============================================================
-- RPC: release_or_reschedule_batch
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_or_reschedule_batch(
  p_batch_id uuid,
  p_claim_token uuid,
  p_expected_batch_version bigint,
  p_reason text DEFAULT 'released',
  p_retry_increment boolean DEFAULT false,
  p_backoff_seconds integer DEFAULT 8
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
  v_backoff int := GREATEST(1, LEAST(COALESCE(p_backoff_seconds, 8), 600));
  v_new_reply_after timestamptz;
BEGIN
  SELECT * INTO v FROM public.ai_reply_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v.status <> 'processing' OR v.claim_token IS DISTINCT FROM p_claim_token
     OR v.batch_version <> p_expected_batch_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_or_not_owner',
      'current_status', v.status, 'current_version', v.batch_version);
  END IF;

  v_new_reply_after := GREATEST(v.last_customer_message_at + make_interval(secs => v_backoff), now() + make_interval(secs => v_backoff));

  UPDATE public.ai_reply_batches
    SET status = 'pending',
        claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
        processing_started_at = NULL,
        reply_after = v_new_reply_after,
        retry_count = retry_count + CASE WHEN p_retry_increment THEN 1 ELSE 0 END,
        last_error = CASE WHEN p_retry_increment THEN COALESCE(p_reason, 'retry') ELSE last_error END,
        batch_version = batch_version + 1
    WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', true, 'reply_after', v_new_reply_after);
END;
$$;

REVOKE ALL ON FUNCTION public.release_or_reschedule_batch(uuid, uuid, bigint, text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_or_reschedule_batch(uuid, uuid, bigint, text, boolean, integer) TO service_role;

-- ============================================================
-- RPC: prepare_batch_sending
-- Final database fence before external LINE Push (Phase 3.2B).
-- Note: DB transaction cannot span the LINE HTTP call; this is a
-- pre-push fence to detect stale workers and to mint a stable
-- idempotency key. Once status='sending' and dispatch begins,
-- the send cannot be atomically cancelled — new customer msgs
-- go into a NEW pending batch (partial unique excludes 'sending').
-- ============================================================
CREATE OR REPLACE FUNCTION public.prepare_batch_sending(
  p_batch_id uuid,
  p_claim_token uuid,
  p_expected_batch_version bigint,
  p_expected_latest_line_message_id text,
  p_reply_text text,
  p_reply_payload jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v RECORD;
  v_key uuid;
BEGIN
  SELECT * INTO v FROM public.ai_reply_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Idempotent: if already sending with same fence, return same key
  IF v.status = 'sending' AND v.claim_token IS NOT DISTINCT FROM p_claim_token
     AND v.batch_version = p_expected_batch_version THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true,
      'line_push_idempotency_key', v.line_push_idempotency_key,
      'reply_text', v.reply_text, 'reply_payload', v.reply_payload);
  END IF;

  IF v.status <> 'processing' OR v.claim_token IS DISTINCT FROM p_claim_token
     OR v.batch_version <> p_expected_batch_version
     OR v.latest_line_message_id <> p_expected_latest_line_message_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_or_not_owner',
      'current_status', v.status, 'current_version', v.batch_version,
      'current_latest_line_message_id', v.latest_line_message_id);
  END IF;

  IF p_reply_text IS NULL OR length(p_reply_text) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_reply_text');
  END IF;

  v_key := COALESCE(v.line_push_idempotency_key, gen_random_uuid());

  UPDATE public.ai_reply_batches
    SET status = 'sending',
        sending_started_at = now(),
        push_started_at = now(),
        reply_text = p_reply_text,
        reply_payload = p_reply_payload,
        line_push_idempotency_key = v_key
        -- Note: keep claim fields so complete/fail can verify the same worker.
    WHERE id = p_batch_id;

  RETURN jsonb_build_object('ok', true, 'idempotent', false,
    'line_push_idempotency_key', v_key,
    'reply_text', p_reply_text, 'reply_payload', p_reply_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_batch_sending(uuid, uuid, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_batch_sending(uuid, uuid, bigint, text, text, jsonb) TO service_role;

-- ============================================================
-- RPC: complete_batch
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_batch(
  p_batch_id uuid,
  p_claim_token uuid,
  p_line_response_status integer DEFAULT NULL,
  p_line_request_id text DEFAULT NULL,
  p_reply_conversation_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v RECORD;
BEGIN
  SELECT * INTO v FROM public.ai_reply_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF v.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  IF v.status <> 'sending' OR v.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_sending_or_not_owner',
      'current_status', v.status);
  END IF;

  UPDATE public.ai_reply_batches
    SET status = 'completed',
        processed_at = now(),
        line_response_status = COALESCE(p_line_response_status, line_response_status),
        line_request_id = COALESCE(p_line_request_id, line_request_id),
        reply_conversation_id = COALESCE(p_reply_conversation_id, reply_conversation_id),
        claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL
    WHERE id = p_batch_id;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_batch(uuid, uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_batch(uuid, uuid, integer, text, uuid) TO service_role;

-- ============================================================
-- RPC: cancel_batch
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_batch(
  p_batch_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v RECORD;
BEGIN
  IF p_reason IS NULL OR length(p_reason) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_reason');
  END IF;
  SELECT * INTO v FROM public.ai_reply_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF v.status IN ('completed','cancelled','failed') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'current_status', v.status);
  END IF;

  IF v.status = 'sending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_late_to_cancel', 'current_status', 'sending');
  END IF;

  UPDATE public.ai_reply_batches
    SET status = 'cancelled',
        cancelled_reason = p_reason,
        processed_at = now(),
        claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
        batch_version = batch_version + 1
    WHERE id = p_batch_id;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_batch(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_batch(uuid, text) TO service_role;

-- ============================================================
-- RPC: fail_batch
-- ============================================================
CREATE OR REPLACE FUNCTION public.fail_batch(
  p_batch_id uuid,
  p_claim_token uuid,
  p_error text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v RECORD;
BEGIN
  IF p_error IS NULL OR length(p_error) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_error');
  END IF;
  SELECT * INTO v FROM public.ai_reply_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF v.status = 'failed' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  IF v.status NOT IN ('processing','sending') OR v.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_owner_or_bad_state',
      'current_status', v.status);
  END IF;

  UPDATE public.ai_reply_batches
    SET status = 'failed',
        failed_at = now(),
        last_error = p_error,
        claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL
    WHERE id = p_batch_id;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.fail_batch(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_batch(uuid, uuid, text) TO service_role;

-- ============================================================
-- RPC: reclaim_stale_batches
-- ============================================================
CREATE OR REPLACE FUNCTION public.reclaim_stale_batches(
  p_limit integer DEFAULT 20
) RETURNS TABLE (batch_id uuid, prior_version bigint, new_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));
BEGIN
  RETURN QUERY
  WITH stale AS (
    SELECT b.id, b.batch_version
      FROM public.ai_reply_batches b
      WHERE b.status = 'processing'
        AND b.claim_expires_at IS NOT NULL
        AND b.claim_expires_at <= now()
      ORDER BY b.claim_expires_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT v_limit
  ), upd AS (
    UPDATE public.ai_reply_batches b
      SET status = 'pending',
          claim_token = NULL, claimed_at = NULL, claim_expires_at = NULL,
          processing_started_at = NULL,
          batch_version = b.batch_version + 1,
          reply_after = GREATEST(now(), b.last_customer_message_at)
      FROM stale
      WHERE b.id = stale.id
      RETURNING b.id AS batch_id, stale.batch_version AS prior_version, b.batch_version AS new_version
  )
  SELECT * FROM upd;
END;
$$;

REVOKE ALL ON FUNCTION public.reclaim_stale_batches(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_batches(integer) TO service_role;

-- ============================================================
-- RPC: cleanup_ai_reply_batches (bounded delete of terminal batches)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_ai_reply_batches(
  p_limit integer DEFAULT 500,
  p_dry_run boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg jsonb;
  v_completed_days int; v_cancelled_days int; v_failed_days int;
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));
  v_completed_count int; v_cancelled_count int; v_failed_count int;
BEGIN
  SELECT durable_ai_batching_config INTO v_cfg FROM public.app_settings LIMIT 1;
  v_completed_days := COALESCE((v_cfg->>'completed_retention_days')::int, 30);
  v_cancelled_days := COALESCE((v_cfg->>'cancelled_retention_days')::int, 30);
  v_failed_days := COALESCE((v_cfg->>'failed_retention_days')::int, 90);

  IF p_dry_run THEN
    SELECT count(*) INTO v_completed_count FROM public.ai_reply_batches
      WHERE status='completed' AND processed_at < now() - make_interval(days => v_completed_days);
    SELECT count(*) INTO v_cancelled_count FROM public.ai_reply_batches
      WHERE status='cancelled' AND processed_at < now() - make_interval(days => v_cancelled_days);
    SELECT count(*) INTO v_failed_count FROM public.ai_reply_batches
      WHERE status='failed' AND failed_at < now() - make_interval(days => v_failed_days);
    RETURN jsonb_build_object('dry_run', true,
      'completed_eligible', v_completed_count,
      'cancelled_eligible', v_cancelled_count,
      'failed_eligible', v_failed_count);
  END IF;

  WITH d AS (
    DELETE FROM public.ai_reply_batches
      WHERE id IN (
        SELECT id FROM public.ai_reply_batches
          WHERE status='completed' AND processed_at < now() - make_interval(days => v_completed_days)
          ORDER BY processed_at ASC LIMIT v_limit
      ) RETURNING 1
  ) SELECT count(*) INTO v_completed_count FROM d;

  WITH d AS (
    DELETE FROM public.ai_reply_batches
      WHERE id IN (
        SELECT id FROM public.ai_reply_batches
          WHERE status='cancelled' AND processed_at < now() - make_interval(days => v_cancelled_days)
          ORDER BY processed_at ASC LIMIT v_limit
      ) RETURNING 1
  ) SELECT count(*) INTO v_cancelled_count FROM d;

  WITH d AS (
    DELETE FROM public.ai_reply_batches
      WHERE id IN (
        SELECT id FROM public.ai_reply_batches
          WHERE status='failed' AND failed_at < now() - make_interval(days => v_failed_days)
          ORDER BY failed_at ASC LIMIT v_limit
      ) RETURNING 1
  ) SELECT count(*) INTO v_failed_count FROM d;

  RETURN jsonb_build_object('dry_run', false,
    'deleted_completed', v_completed_count,
    'deleted_cancelled', v_cancelled_count,
    'deleted_failed', v_failed_count);
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_ai_reply_batches(integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_ai_reply_batches(integer, boolean) TO service_role;
