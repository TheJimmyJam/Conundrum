-- ─────────────────────────────────────────────────────────────────────────────
-- admin_auto_populate_daily_sets
--
-- Creates draft daily sets (10 questions each) for the next p_days_ahead days,
-- skipping dates that already have a set.
--
-- Selection logic:
--   1. Prefer questions not used in any set in the last 60 days
--   2. Always exclude questions already scheduled in future/today sets
--   3. Within each set, order easiest→hardest (correct_rate DESC, NULLS treated as 0.5)
--   4. If < 10 questions pass the 60-day filter, relax it (just avoid current/future sets)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_auto_populate_daily_sets(p_days_ahead int DEFAULT 7)
RETURNS TABLE(created_count int, skipped_count int, dates_created text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin    int;
  v_date     date;
  v_set_id   uuid;
  v_created  int := 0;
  v_skipped  int := 0;
  v_dates    text[] := '{}';
  v_q_ids    uuid[];
  i          int;
  v_slot     int;
BEGIN
  -- Admin guard
  SELECT COUNT(*) INTO v_admin
  FROM profiles
  WHERE profiles.id = auth.uid() AND profiles.role = 'admin';

  IF v_admin = 0 THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR i IN 0..(p_days_ahead - 1) LOOP
    v_date := CURRENT_DATE + 1 + i;  -- start from tomorrow

    -- Skip if a set already exists for this date
    IF EXISTS (SELECT 1 FROM daily_sets WHERE set_date = v_date) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- ── Attempt 1: strict — avoid 60-day recency + avoid all current/future sets ──
    SELECT ARRAY_AGG(sub.id ORDER BY sub.rate DESC)
    INTO v_q_ids
    FROM (
      SELECT q.id,
             COALESCE(qs.correct_rate, 0.5) AS rate
      FROM questions q
      LEFT JOIN question_stats qs ON qs.question_id = q.id
      WHERE q.is_active = true
        -- Not in any set dated today or later (includes ones we're creating in this loop)
        AND NOT EXISTS (
          SELECT 1
          FROM daily_set_questions dsq
          JOIN daily_sets ds ON ds.id = dsq.daily_set_id
          WHERE dsq.question_id = q.id
            AND ds.set_date >= CURRENT_DATE
        )
        -- Not used in the past 60 days
        AND NOT EXISTS (
          SELECT 1
          FROM daily_set_questions dsq
          JOIN daily_sets ds ON ds.id = dsq.daily_set_id
          WHERE dsq.question_id = q.id
            AND ds.set_date >= (CURRENT_DATE - 60)
            AND ds.set_date < CURRENT_DATE
        )
      ORDER BY RANDOM()
      LIMIT 10
    ) sub;

    -- ── Attempt 2: relax 60-day rule — avoid only current/future sets ──
    IF array_length(v_q_ids, 1) IS NULL OR array_length(v_q_ids, 1) < 10 THEN
      SELECT ARRAY_AGG(sub.id ORDER BY sub.rate DESC)
      INTO v_q_ids
      FROM (
        SELECT q.id,
               COALESCE(qs.correct_rate, 0.5) AS rate
        FROM questions q
        LEFT JOIN question_stats qs ON qs.question_id = q.id
        WHERE q.is_active = true
          AND NOT EXISTS (
            SELECT 1
            FROM daily_set_questions dsq
            JOIN daily_sets ds ON ds.id = dsq.daily_set_id
            WHERE dsq.question_id = q.id
              AND ds.set_date >= CURRENT_DATE
          )
        ORDER BY RANDOM()
        LIMIT 10
      ) sub;
    END IF;

    -- ── Not enough questions to build a set → skip this date ──
    IF array_length(v_q_ids, 1) IS NULL OR array_length(v_q_ids, 1) < 10 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Create draft set
    INSERT INTO daily_sets (set_date, is_published)
    VALUES (v_date, false)
    RETURNING id INTO v_set_id;

    -- Insert 10 questions ordered easiest (slot 1) → hardest (slot 10)
    FOR v_slot IN 1..10 LOOP
      INSERT INTO daily_set_questions (daily_set_id, question_id, position)
      VALUES (v_set_id, v_q_ids[v_slot], v_slot);
    END LOOP;

    v_created := v_created + 1;
    v_dates   := v_dates || v_date::text;
  END LOOP;

  RETURN QUERY SELECT v_created, v_skipped, v_dates;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_auto_populate_daily_sets(int) TO authenticated;
