CREATE OR REPLACE FUNCTION get_daily_leaderboard_friends(
  p_daily_set_id uuid,
  p_limit        int DEFAULT 50
)
RETURNS TABLE (
  rank         bigint,
  user_id      uuid,
  username     text,
  display_name text,
  score        integer,
  correct_count integer,
  duration_ms  bigint
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
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY gs.correct_count DESC, gs.duration_ms ASC)::bigint AS rank,
    gs.user_id::uuid,
    p.username::text,
    p.display_name::text,
    gs.score::integer,
    gs.correct_count::integer,
    gs.duration_ms::bigint
  FROM game_sessions gs
  JOIN profiles p ON p.id = gs.user_id
  WHERE gs.daily_set_id = p_daily_set_id
    AND gs.status = 'completed'
    AND gs.user_id IN (SELECT fid FROM friend_ids)
    -- Anti-cheat: filter flagged sessions EXCEPT always show the calling user's own score
    AND (gs.anti_cheat_flag = false OR gs.user_id = auth.uid())
  ORDER BY gs.correct_count DESC, gs.duration_ms ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_leaderboard_friends(uuid, int) TO authenticated;
