-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-sort a daily set's questions from easiest → hardest
-- Uses correct_rate from question_stats (highest = easiest = slot 1).
-- Questions with no play data are treated as median difficulty (0.50)
-- and naturally land in the middle of the ordered set.
-- Two-phase update avoids hitting the UNIQUE(daily_set_id, position) constraint.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_sort_set_by_difficulty(p_set_id uuid)
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

  -- Phase 1: shift all positions out of the way
  UPDATE daily_set_questions
  SET position = position + 10000
  WHERE daily_set_id = p_set_id;

  -- Phase 2: assign positions 1..N, easiest first
  -- No stats → treated as 0.50 correct rate (middle difficulty)
  WITH ranked AS (
    SELECT
      dsq.id AS dsq_id,
      ROW_NUMBER() OVER (
        ORDER BY COALESCE(
          CASE WHEN qs.total_answers > 0
               THEN qs.correct_answers::float / qs.total_answers
               ELSE NULL END,
          0.50
        ) DESC  -- highest correct rate = easiest = position 1
      ) AS new_pos
    FROM daily_set_questions dsq
    LEFT JOIN question_stats qs ON qs.question_id = dsq.question_id
    WHERE dsq.daily_set_id = p_set_id
  )
  UPDATE daily_set_questions
  SET position = ranked.new_pos
  FROM ranked
  WHERE daily_set_questions.daily_set_id = p_set_id
    AND daily_set_questions.id = ranked.dsq_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Return all questions used in ANY daily set (past or scheduled).
-- Used to prevent re-use and show "already in daily" warnings in the picker.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_daily_question_usage()
RETURNS TABLE (
  question_id      uuid,
  times_used       int,
  most_recent_date date,
  upcoming_date    date   -- next future date this question is scheduled, if any
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
    dsq.question_id,
    COUNT(*)::int                                                AS times_used,
    MAX(ds.set_date)                                            AS most_recent_date,
    MIN(ds.set_date) FILTER (
      WHERE ds.set_date >= (NOW() AT TIME ZONE 'America/New_York')::date
    )                                                           AS upcoming_date
  FROM daily_set_questions dsq
  JOIN daily_sets ds ON ds.id = dsq.daily_set_id
  GROUP BY dsq.question_id;
END;
$$;
