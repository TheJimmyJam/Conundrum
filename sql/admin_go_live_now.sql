-- ─────────────────────────────────────────────────────────────────────────────
-- admin_go_live_now
--
-- Forces a daily set live immediately, regardless of its scheduled date.
--   1. Validates the target set has exactly 10 questions.
--   2. Unpublishes whatever is currently live for today (keeps its date so
--      history / any completed sessions are preserved).
--   3. Moves the target set to today's date (ET) and publishes it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_go_live_now(p_set_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today        date;
  v_q_count      bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_today := (NOW() AT TIME ZONE 'America/New_York')::date;

  -- Verify the set has 10 questions
  SELECT COUNT(*) INTO v_q_count
  FROM daily_set_questions
  WHERE daily_set_id = p_set_id;

  IF v_q_count < 10 THEN
    RAISE EXCEPTION 'Set only has % question(s). Needs 10 to go live.', v_q_count;
  END IF;

  -- Bump any currently live set back to draft (keep its date for history)
  UPDATE daily_sets
  SET is_published = false
  WHERE set_date = v_today
    AND is_published = true
    AND id <> p_set_id;

  -- Move target set to today and publish
  UPDATE daily_sets
  SET set_date     = v_today,
      is_published = true
  WHERE id = p_set_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_go_live_now(uuid) TO authenticated;
