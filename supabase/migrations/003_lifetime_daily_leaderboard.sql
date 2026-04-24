-- ============================================================
-- Lifetime Daily Score Leaderboard
-- Returns each player's cumulative score across all completed
-- daily sets (flagged/cheated sessions excluded).
-- ============================================================

CREATE OR REPLACE FUNCTION get_lifetime_daily_leaderboard(
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  rank          bigint,
  user_id       uuid,
  username      text,
  display_name  text,
  total_score   bigint,
  games_played  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH totals AS (
    SELECT
      gs.user_id,
      SUM(gs.score)::bigint   AS total_score,
      COUNT(*)::bigint        AS games_played,
      p.username,
      p.display_name
    FROM game_sessions gs
    JOIN profiles p ON p.id = gs.user_id
    WHERE gs.mode = 'daily'
      AND gs.status = 'completed'
      AND gs.anti_cheat_flag = false
    GROUP BY gs.user_id, p.username, p.display_name
  )
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY t.total_score DESC, t.games_played DESC
    )::bigint AS rank,
    t.user_id::uuid,
    t.username::text,
    t.display_name::text,
    t.total_score,
    t.games_played
  FROM totals t
  ORDER BY t.total_score DESC, t.games_played DESC
  LIMIT p_limit;
END;
$$;

-- Public leaderboard — accessible to both logged-in and anonymous users
GRANT EXECUTE ON FUNCTION get_lifetime_daily_leaderboard(int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_lifetime_daily_leaderboard(int) TO anon;
