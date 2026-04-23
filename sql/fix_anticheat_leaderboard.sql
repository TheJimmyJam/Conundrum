-- ── 1. Unflag your most recent daily session ─────────────────────────────────
-- Run this to un-flag the session that got caught by the anti-cheat.
-- Replace 'your-email@example.com' with the email of the test account.

UPDATE game_sessions
SET anti_cheat_flag = false
WHERE id = (
  SELECT gs.id
  FROM game_sessions gs
  JOIN auth.users u ON gs.user_id = u.id
  WHERE u.email = 'your-email@example.com'
    AND gs.mode = 'daily'
    AND gs.status = 'completed'
  ORDER BY gs.started_at DESC
  LIMIT 1
);

-- ── 2. Check if get_daily_leaderboard RPC filters flagged sessions ────────────
-- Run this to see the RPC definition:
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'get_daily_leaderboard';

-- ── 3. If the RPC filters anti_cheat_flag = false, replace it ────────────────
-- Only run this if step 2 shows WHERE anti_cheat_flag = false (or similar).
-- This version INCLUDES flagged sessions but returns the flag so the UI can badge them.
-- ⚠️  Adjust column names/types to match what step 2 shows before running.

/*
CREATE OR REPLACE FUNCTION get_daily_leaderboard(p_daily_set_id uuid, p_limit int DEFAULT 50)
RETURNS TABLE (
  rank        bigint,
  user_id     uuid,
  username    text,
  display_name text,
  score       int,
  correct_count int,
  duration_ms bigint,
  anti_cheat_flag boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    RANK() OVER (ORDER BY gs.score DESC, gs.duration_ms ASC NULLS LAST)::bigint,
    gs.user_id,
    p.username,
    p.display_name,
    gs.score,
    gs.correct_count,
    gs.duration_ms,
    gs.anti_cheat_flag
  FROM game_sessions gs
  JOIN profiles p ON p.id = gs.user_id
  WHERE gs.daily_set_id = p_daily_set_id
    AND gs.status = 'completed'
  ORDER BY 1
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
*/
