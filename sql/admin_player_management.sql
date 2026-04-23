-- ─────────────────────────────────────────────────────────────────────────────
-- Player Management: status column + admin RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add status column to profiles (active | banned | frozen)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'banned', 'frozen'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. admin_search_players (rewritten)
--    • Real users first, demo users last
--    • No hard 100-row cap — returns up to 500, paginated via p_limit/p_offset
--    • Includes status field
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_search_players(
  p_query  text    DEFAULT '',
  p_limit  int     DEFAULT 200,
  p_offset int     DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  username     text,
  display_name text,
  email        text,
  role         text,
  status       text,
  created_at   timestamptz,
  games_played bigint,
  best_score   bigint,
  is_demo      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id::uuid,
    p.username::text,
    p.display_name::text,
    u.email::text,
    p.role::text,
    p.status::text,
    p.created_at::timestamptz,
    COUNT(gs.id)::bigint        AS games_played,
    MAX(gs.score)::bigint       AS best_score,
    (u.email LIKE '%@demo.conundrum.test')::boolean AS is_demo
  FROM profiles p
  LEFT JOIN auth.users u   ON u.id = p.id
  LEFT JOIN game_sessions gs ON gs.user_id = p.id AND gs.status = 'completed'
  WHERE
    p_query = ''
    OR p.username     ILIKE '%' || p_query || '%'
    OR p.display_name ILIKE '%' || p_query || '%'
    OR u.email        ILIKE '%' || p_query || '%'
  GROUP BY p.id, p.username, p.display_name, u.email, p.role, p.status, p.created_at
  ORDER BY
    (u.email LIKE '%@demo.conundrum.test') ASC,  -- real users first
    p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. admin_set_player_status — ban / freeze / reactivate
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_set_player_status(
  p_user_id uuid,
  p_status  text   -- 'active' | 'banned' | 'frozen'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_status NOT IN ('active', 'banned', 'frozen') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  -- Prevent admins from banning themselves
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own status';
  END IF;

  UPDATE profiles SET status = p_status WHERE profiles.id = p_user_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. admin_update_player_profile — edit display name / username
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_update_player_profile(
  p_user_id      uuid,
  p_display_name text,
  p_username     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Username uniqueness check (exclude self)
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.username = p_username AND profiles.id != p_user_id
  ) THEN
    RAISE EXCEPTION 'Username "%" is already taken', p_username;
  END IF;

  UPDATE profiles
  SET
    display_name = NULLIF(trim(p_display_name), ''),
    username     = trim(p_username)
  WHERE profiles.id = p_user_id;
END;
$$;


-- Grants
GRANT EXECUTE ON FUNCTION admin_search_players(text, int, int)     TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_player_status(uuid, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_player_profile(uuid, text, text) TO authenticated;
