CREATE OR REPLACE FUNCTION get_daily_leaderboard_friends(
  p_daily_set_id uuid,
  p_limit        int DEFAULT 50
)
RETURNS TABLE (
  rank            bigint,
  user_id         uuid,
  username        text,
  display_name    text,
  score           integer,
  correct_count   integer,
  duration_ms     bigint,
  anti_cheat_flag boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH friend_ids AS (
    SELECT addressee_id AS fid
    FROM friendships
    WHERE requester_id = auth.uid() AND status = 'accepted'
    UNION ALL
    SELECT requester_id AS fid
    FROM friendships
    WHERE addressee_id = auth.uid() AND status = 'accepted'
    UNION ALL
    SELECT auth.uid()
  ),
  sessions AS (
    SELECT
      gs.user_id,
      gs.score,
      gs.correct_count,
      gs.duration_ms,
      gs.anti_cheat_flag,
      p.username,
      p.display_name
    FROM game_sessions gs
    JOIN profiles p ON p.id = gs.user_id
    WHERE gs.daily_set_id = p_daily_set_id
      AND gs.status = 'completed'
      AND gs.user_id IN (SELECT fid FROM friend_ids)
      -- Always include the calling user; filter flagged scores from others
      AND (gs.anti_cheat_flag = false OR gs.user_id = auth.uid())
  )
  SELECT
    -- Flagged entries rank after all clean entries
    ROW_NUMBER() OVER (
      ORDER BY s.anti_cheat_flag ASC, s.correct_count DESC, s.duration_ms ASC
    )::bigint AS rank,
    s.user_id::uuid,
    s.username::text,
    s.display_name::text,
    s.score::integer,
    s.correct_count::integer,
    s.duration_ms::bigint,
    s.anti_cheat_flag::boolean
  FROM sessions s
  ORDER BY s.anti_cheat_flag ASC, s.correct_count DESC, s.duration_ms ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_leaderboard_friends(uuid, int) TO authenticated;
