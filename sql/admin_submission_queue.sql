-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-feature: runs via pg_cron at 11:00 UTC (6 AM EST) daily.
-- Promotes the oldest approved submission if nothing is featured yet today.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_feature_daily_submission()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today    date;
  v_next_id  uuid;
BEGIN
  v_today := (NOW() AT TIME ZONE 'America/New_York')::date;

  IF EXISTS (
    SELECT 1 FROM question_submissions
    WHERE featured_date = v_today AND status = 'featured'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_next_id
  FROM question_submissions
  WHERE status = 'approved'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_next_id IS NULL THEN RETURN; END IF;

  UPDATE question_submissions
  SET status = 'featured', featured_date = v_today
  WHERE id = v_next_id;
END;
$$;

-- pg_cron schedule (run once to register — idempotent):
-- SELECT cron.schedule('auto-feature-daily-submission', '0 11 * * *',
--   $$SELECT auto_feature_daily_submission()$$);


-- ─────────────────────────────────────────────────────────────────────────────
-- Admin: Get queue (today's featured + all approved, oldest first)
-- NOTE: All SELECT columns must use explicit AS aliases to avoid the
-- PostgreSQL "column reference is ambiguous" error with RETURNS TABLE.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_submission_queue()
RETURNS TABLE (
  id             uuid,
  username       text,
  prompt         text,
  option_a       text,
  option_b       text,
  option_c       text,
  option_d       text,
  correct_option text,
  explanation    text,
  status         text,
  featured_date  date,
  created_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    qs.id             AS id,
    qs.username       AS username,
    qs.prompt         AS prompt,
    qs.option_a       AS option_a,
    qs.option_b       AS option_b,
    qs.option_c       AS option_c,
    qs.option_d       AS option_d,
    qs.correct_option AS correct_option,
    qs.explanation    AS explanation,
    qs.status         AS status,
    qs.featured_date  AS featured_date,
    qs.created_at     AS created_at
  FROM question_submissions qs
  WHERE qs.status IN ('featured', 'approved')
  ORDER BY
    CASE WHEN qs.status = 'featured' THEN 0 ELSE 1 END,
    qs.created_at ASC;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Admin: Edit a submission's content
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_update_submission(
  p_id             uuid,
  p_prompt         text,
  p_option_a       text,
  p_option_b       text,
  p_option_c       text,
  p_option_d       text,
  p_correct_option text,
  p_explanation    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE question_submissions
  SET
    prompt         = p_prompt,
    option_a       = p_option_a,
    option_b       = p_option_b,
    option_c       = p_option_c,
    option_d       = p_option_d,
    correct_option = p_correct_option,
    explanation    = p_explanation
  WHERE id = p_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Admin: Delete (reject) a submission — removes from queue and daily slot
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_delete_submission(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE question_submissions
  SET status = 'rejected', featured_date = NULL
  WHERE id = p_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Admin: Feature a specific submission immediately (replaces today's slot)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_feature_submission_now(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_today := (NOW() AT TIME ZONE 'America/New_York')::date;

  -- Bump whatever is currently featured back to approved
  UPDATE question_submissions
  SET status = 'approved', featured_date = NULL
  WHERE featured_date = v_today AND status = 'featured';

  -- Feature the requested one
  UPDATE question_submissions
  SET status = 'featured', featured_date = v_today
  WHERE id = p_id;
END;
$$;
