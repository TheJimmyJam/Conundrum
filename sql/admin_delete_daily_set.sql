-- ─────────────────────────────────────────────────────────────────────────────
-- admin_delete_daily_set
--
-- Deletes a daily set and its questions (cascade).
-- Only admins can call this. Will not delete sets that have completed
-- game sessions to protect historical data.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_delete_daily_set(p_set_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin guard
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Prevent deleting sets that already have completed game sessions
  IF EXISTS (
    SELECT 1 FROM game_sessions
    WHERE daily_set_id = p_set_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Cannot delete a set that has already been played. Unpublish it instead.';
  END IF;

  -- Delete the set — daily_set_questions cascade automatically
  DELETE FROM daily_sets WHERE id = p_set_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_daily_set(uuid) TO authenticated;
