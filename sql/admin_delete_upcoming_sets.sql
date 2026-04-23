-- ─────────────────────────────────────────────────────────────────────────────
-- admin_delete_upcoming_sets
--
-- Deletes all future draft (unpublished) daily sets that have no completed
-- game sessions. Safe to run at any time — never touches live or played sets.
-- Returns the count of sets deleted.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_delete_upcoming_sets()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH deleted AS (
    DELETE FROM daily_sets
    WHERE set_date > CURRENT_DATE
      AND is_published = false
      AND NOT EXISTS (
        SELECT 1 FROM game_sessions
        WHERE game_sessions.daily_set_id = daily_sets.id
          AND game_sessions.status = 'completed'
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_upcoming_sets() TO authenticated;
