-- ─────────────────────────────────────────────────────────────────────────────
-- Admin: Get daily players for a given date
-- Returns all users who completed the daily set on that date, ranked by score.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_daily_players(p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE (
  session_id        uuid,
  user_id           uuid,
  username          text,
  display_name      text,
  score             int,
  correct_count     int,
  completed_at      timestamptz,
  anti_cheat_flag   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    gs.id           AS session_id,
    gs.user_id,
    p.username,
    p.display_name,
    gs.score,
    gs.correct_count,
    gs.completed_at,
    gs.anti_cheat_flag
  FROM game_sessions gs
  JOIN profiles    p  ON p.id  = gs.user_id
  JOIN daily_sets  ds ON ds.id = gs.daily_set_id
  WHERE ds.set_date = p_date
    AND gs.status   = 'completed'
    AND gs.mode     = 'daily'
  ORDER BY gs.score DESC, gs.duration_ms ASC;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Admin: Reset (delete) a user's daily session
-- Removes responses first (FK), then the session itself.
-- The player will be able to play that day's set again from scratch.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_reset_daily_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Verify it's a daily session (not endless)
  IF NOT EXISTS (
    SELECT 1 FROM game_sessions
    WHERE id = p_session_id AND mode = 'daily'
  ) THEN
    RAISE EXCEPTION 'Session not found or not a daily session';
  END IF;

  -- Delete responses first (FK constraint)
  DELETE FROM responses    WHERE game_session_id = p_session_id;
  -- Delete the session
  DELETE FROM game_sessions WHERE id              = p_session_id;
END;
$$;
