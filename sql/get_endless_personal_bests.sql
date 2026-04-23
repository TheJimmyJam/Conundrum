-- ─────────────────────────────────────────────────────────────────────────────
-- get_endless_personal_bests
--
-- Returns the caller's best streak and best score for each endless mode they've
-- played (one row per category_id, NULL = random). Used to display personal
-- records on the endless hub tile cards.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_endless_personal_bests()
RETURNS TABLE (
  category_id  uuid,
  best_streak  int,
  best_score   int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gs.category_id,
    MAX(gs.longest_streak)::int  AS best_streak,
    MAX(gs.score)::int           AS best_score
  FROM game_sessions gs
  WHERE gs.user_id = auth.uid()
    AND gs.mode    = 'endless'
    AND gs.status  = 'completed'
  GROUP BY gs.category_id;
$$;

GRANT EXECUTE ON FUNCTION get_endless_personal_bests() TO authenticated;
