-- ─────────────────────────────────────────────────────────────────────────────
-- admin_queue_submission
--
-- Schedules an approved submission as the next available community question.
-- Finds the latest featured_date in the queue (>= today) and adds one day,
-- so each call appends to the end of the line.
--
-- Also approves the submission if it is still pending/unreviewed.
-- Returns the date it was scheduled for.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_queue_submission(p_id uuid)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_date date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM question_submissions WHERE id = p_id) THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  -- Find the next open date: day after the latest queued future submission,
  -- or tomorrow if the queue is empty
  SELECT COALESCE(MAX(featured_date), CURRENT_DATE) + 1
  INTO v_next_date
  FROM question_submissions
  WHERE status = 'featured'
    AND featured_date >= CURRENT_DATE;

  -- Schedule the submission
  UPDATE question_submissions
  SET
    status        = 'featured',
    featured_date = v_next_date,
    reviewed_by   = auth.uid(),
    reviewed_at   = now()
  WHERE id = p_id;

  RETURN v_next_date;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_queue_submission(uuid) TO authenticated;
