-- ─────────────────────────────────────────────────────────────────────────────
-- admin_auto_populate_daily_sets
--
-- Creates draft daily sets (10 questions each) for the next p_days_ahead days,
-- skipping dates that already have a set.
--
-- Selection: 3 easy + 3 medium + 4 hard, random within each group.
-- Ordering:  easiest→hardest within each bucket by correct_rate (higher = easier),
--            so slot 1 is always easy and slot 10 is always hard.
--
-- Difficulty bucketing (Einstein Scale first, fallback to stored label):
--   If the question has answer data (total_answers > 0):
--     correct_rate >= 0.70  -> easy   (Einstein tiers 1-3)
--     correct_rate >= 0.40  -> medium (Einstein tiers 4-6)
--     correct_rate <  0.40  -> hard   (Einstein tiers 7-10)
--   Otherwise: use q.difficulty (easy / medium / hard)
--
-- Fallback: if strict (60-day recency) pool is too small, relaxes to just
--           avoiding current/future sets.
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
    v_date := CURRENT_DATE + 1 + i;

    -- Skip if a set already exists for this date
    IF EXISTS (SELECT 1 FROM daily_sets WHERE set_date = v_date) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- ── Attempt 1: strict — avoid 60-day recency + current/future sets ────────
    SELECT ARRAY_AGG(sub.id ORDER BY sub.diff_order ASC, sub.rate DESC)
    INTO v_q_ids
    FROM (
      SELECT * FROM (
        SELECT q.id, 1 AS diff_order,
          CASE
            WHEN qs.total_answers > 0 THEN qs.correct_answers::float / qs.total_answers
            ELSE 0.80
          END AS rate
        FROM questions q
        LEFT JOIN question_stats qs ON qs.question_id = q.id
        WHERE q.is_active = true
          AND (
            CASE
              WHEN qs.total_answers > 0
                THEN CASE
                  WHEN qs.correct_answers::float / qs.total_answers >= 0.70 THEN 'easy'
                  WHEN qs.correct_answers::float / qs.total_answers >= 0.40 THEN 'medium'
                  ELSE 'hard'
                END
              ELSE q.difficulty
            END
          ) = 'easy'
          AND NOT EXISTS (
            SELECT 1 FROM daily_set_questions dsq
            JOIN daily_sets ds ON ds.id = dsq.daily_set_id
            WHERE dsq.question_id = q.id AND ds.set_date >= CURRENT_DATE
          )
          AND NOT EXISTS (
            SELECT 1 FROM daily_set_questions dsq
            JOIN daily_sets ds ON ds.id = dsq.daily_set_id
            WHERE dsq.question_id = q.id
              AND ds.set_date >= (CURRENT_DATE - 60)
              AND ds.set_date < CURRENT_DATE
          )
        ORDER BY RANDOM() LIMIT 3
      ) easy3

      UNION ALL

      SELECT * FROM (
        SELECT q.id, 2 AS diff_order,
          CASE
            WHEN qs.total_answers > 0 THEN qs.correct_answers::float / qs.total_answers
            ELSE 0.55
          END AS rate
        FROM questions q
        LEFT JOIN question_stats qs ON qs.question_id = q.id
        WHERE q.is_active = true
          AND (
            CASE
              WHEN qs.total_answers > 0
                THEN CASE
                  WHEN qs.correct_answers::float / qs.total_answers >= 0.70 THEN 'easy'
                  WHEN qs.correct_answers::float / qs.total_answers >= 0.40 THEN 'medium'
                  ELSE 'hard'
                END
              ELSE q.difficulty
            END
          ) = 'medium'
          AND NOT EXISTS (
            SELECT 1 FROM daily_set_questions dsq
            JOIN daily_sets ds ON ds.id = dsq.daily_set_id
            WHERE dsq.question_id = q.id AND ds.set_date >= CURRENT_DATE
          )
          AND NOT EXISTS (
            SELECT 1 FROM daily_set_questions dsq
            JOIN daily_sets ds ON ds.id = dsq.daily_set_id
            WHERE dsq.question_id = q.id
              AND ds.set_date >= (CURRENT_DATE - 60)
              AND ds.set_date < CURRENT_DATE
          )
        ORDER BY RANDOM() LIMIT 3
      ) med3

      UNION ALL

      SELECT * FROM (
        SELECT q.id, 3 AS diff_order,
          CASE
            WHEN qs.total_answers > 0 THEN qs.correct_answers::float / qs.total_answers
            ELSE 0.25
          END AS rate
        FROM questions q
        LEFT JOIN question_stats qs ON qs.question_id = q.id
        WHERE q.is_active = true
          AND (
            CASE
              WHEN qs.total_answers > 0
                THEN CASE
                  WHEN qs.correct_answers::float / qs.total_answers >= 0.70 THEN 'easy'
                  WHEN qs.correct_answers::float / qs.total_answers >= 0.40 THEN 'medium'
                  ELSE 'hard'
                END
              ELSE q.difficulty
            END
          ) = 'hard'
          AND NOT EXISTS (
            SELECT 1 FROM daily_set_questions dsq
            JOIN daily_sets ds ON ds.id = dsq.daily_set_id
            WHERE dsq.question_id = q.id AND ds.set_date >= CURRENT_DATE
          )
          AND NOT EXISTS (
            SELECT 1 FROM daily_set_questions dsq
            JOIN daily_sets ds ON ds.id = dsq.daily_set_id
            WHERE dsq.question_id = q.id
              AND ds.set_date >= (CURRENT_DATE - 60)
              AND ds.set_date < CURRENT_DATE
          )
        ORDER BY RANDOM() LIMIT 4
      ) hard4
    ) sub;

    -- ── Attempt 2: relax 60-day rule — avoid only current/future sets ──────────
    IF array_length(v_q_ids, 1) IS NULL OR array_length(v_q_ids, 1) < 10 THEN
      SELECT ARRAY_AGG(sub.id ORDER BY sub.diff_order ASC, sub.rate DESC)
      INTO v_q_ids
      FROM (
        SELECT * FROM (
          SELECT q.id, 1 AS diff_order,
            CASE
              WHEN qs.total_answers > 0 THEN qs.correct_answers::float / qs.total_answers
              ELSE 0.80
            END AS rate
          FROM questions q
          LEFT JOIN question_stats qs ON qs.question_id = q.id
          WHERE q.is_active = true
            AND (
              CASE
                WHEN qs.total_answers > 0
                  THEN CASE
                    WHEN qs.correct_answers::float / qs.total_answers >= 0.70 THEN 'easy'
                    WHEN qs.correct_answers::float / qs.total_answers >= 0.40 THEN 'medium'
                    ELSE 'hard'
                  END
                ELSE q.difficulty
              END
            ) = 'easy'
            AND NOT EXISTS (
              SELECT 1 FROM daily_set_questions dsq
              JOIN daily_sets ds ON ds.id = dsq.daily_set_id
              WHERE dsq.question_id = q.id AND ds.set_date >= CURRENT_DATE
            )
          ORDER BY RANDOM() LIMIT 3
        ) easy3

        UNION ALL

        SELECT * FROM (
          SELECT q.id, 2 AS diff_order,
            CASE
              WHEN qs.total_answers > 0 THEN qs.correct_answers::float / qs.total_answers
              ELSE 0.55
            END AS rate
          FROM questions q
          LEFT JOIN question_stats qs ON qs.question_id = q.id
          WHERE q.is_active = true
            AND (
              CASE
                WHEN qs.total_answers > 0
                  THEN CASE
                    WHEN qs.correct_answers::float / qs.total_answers >= 0.70 THEN 'easy'
                    WHEN qs.correct_answers::float / qs.total_answers >= 0.40 THEN 'medium'
                    ELSE 'hard'
                  END
                ELSE q.difficulty
              END
            ) = 'medium'
            AND NOT EXISTS (
              SELECT 1 FROM daily_set_questions dsq
              JOIN daily_sets ds ON ds.id = dsq.daily_set_id
              WHERE dsq.question_id = q.id AND ds.set_date >= CURRENT_DATE
            )
          ORDER BY RANDOM() LIMIT 3
        ) med3

        UNION ALL

        SELECT * FROM (
          SELECT q.id, 3 AS diff_order,
            CASE
              WHEN qs.total_answers > 0 THEN qs.correct_answers::float / qs.total_answers
              ELSE 0.25
            END AS rate
          FROM questions q
          LEFT JOIN question_stats qs ON qs.question_id = q.id
          WHERE q.is_active = true
            AND (
              CASE
                WHEN qs.total_answers > 0
                  THEN CASE
                    WHEN qs.correct_answers::float / qs.total_answers >= 0.70 THEN 'easy'
                    WHEN qs.correct_answers::float / qs.total_answers >= 0.40 THEN 'medium'
                    ELSE 'hard'
                  END
                ELSE q.difficulty
              END
            ) = 'hard'
            AND NOT EXISTS (
              SELECT 1 FROM daily_set_questions dsq
              JOIN daily_sets ds ON ds.id = dsq.daily_set_id
              WHERE dsq.question_id = q.id AND ds.set_date >= CURRENT_DATE
            )
          ORDER BY RANDOM() LIMIT 4
        ) hard4
      ) sub;
    END IF;

    -- ── Not enough questions → skip this date ─────────────────────────────────
    IF array_length(v_q_ids, 1) IS NULL OR array_length(v_q_ids, 1) < 10 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Create draft set
    INSERT INTO daily_sets (set_date, is_published)
    VALUES (v_date, false)
    RETURNING id INTO v_set_id;

    -- Insert questions in order: slot 1 = easiest, slot 10 = hardest
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
