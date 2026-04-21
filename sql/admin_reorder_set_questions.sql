-- ─────────────────────────────────────────────────────────────────────────────
-- Admin: Reorder questions within a daily set
-- Accepts the dsq IDs in desired display order; assigns positions 1..N.
-- Uses a two-phase update to avoid hitting the UNIQUE(daily_set_id, position)
-- constraint during intermediate states.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_reorder_set_questions(
  p_set_id         uuid,
  p_ordered_ids    uuid[]   -- dsq IDs (daily_set_questions.id) in desired order
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dsq_id  uuid;
  v_pos     int := 1;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Phase 1: shift all positions up by 10000 to clear the 1..10 slots
  UPDATE daily_set_questions
  SET position = position + 10000
  WHERE daily_set_id = p_set_id;

  -- Phase 2: assign final positions in the requested order
  FOREACH v_dsq_id IN ARRAY p_ordered_ids LOOP
    UPDATE daily_set_questions
    SET position = v_pos
    WHERE id = v_dsq_id AND daily_set_id = p_set_id;
    v_pos := v_pos + 1;
  END LOOP;
END;
$$;
