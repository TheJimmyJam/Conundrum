-- ============================================================
-- Add difficulty column to question_submissions
-- Defaults to 'medium' for existing rows.
-- Also updates the queue RPC to return it, and the update RPC
-- to allow changing it, and the review RPC to use it instead
-- of hardcoding 'medium' when promoting to the questions vault.
-- ============================================================

ALTER TABLE question_submissions
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard'));

-- ─── admin_get_submission_queue — add difficulty to return cols ───────────────

CREATE OR REPLACE FUNCTION admin_get_submission_queue()
RETURNS TABLE (
  id             uuid,
  username       text,
  prompt         text,
  option_a       text,
  option_b       text,
  option_c       text,
  option_d       text,
  correct_option text,
  explanation    text,
  difficulty     text,
  status         text,
  featured_date  date,
  created_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_today := (NOW() AT TIME ZONE 'America/New_York')::date;

  RETURN QUERY
  SELECT
    qs.id             AS id,
    qs.username       AS username,
    qs.prompt         AS prompt,
    qs.option_a       AS option_a,
    qs.option_b       AS option_b,
    qs.option_c       AS option_c,
    qs.option_d       AS option_d,
    qs.correct_option AS correct_option,
    qs.explanation    AS explanation,
    qs.difficulty     AS difficulty,
    qs.status         AS status,
    qs.featured_date  AS featured_date,
    qs.created_at     AS created_at
  FROM question_submissions qs
  WHERE
    (qs.status = 'featured' AND qs.featured_date = v_today)
    OR
    (qs.status = 'featured' AND qs.featured_date > v_today)
    OR
    (qs.status = 'approved')
  ORDER BY
    CASE WHEN qs.status = 'featured' AND qs.featured_date = v_today THEN 0 ELSE 1 END ASC,
    qs.featured_date ASC NULLS LAST,
    qs.created_at ASC;
END;
$$;

-- ─── admin_update_submission — add difficulty param ───────────────────────────

CREATE OR REPLACE FUNCTION admin_update_submission(
  p_id             uuid,
  p_prompt         text,
  p_option_a       text,
  p_option_b       text,
  p_option_c       text,
  p_option_d       text,
  p_correct_option text,
  p_explanation    text,
  p_difficulty     text DEFAULT 'medium'
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

  UPDATE question_submissions
  SET
    prompt         = p_prompt,
    option_a       = p_option_a,
    option_b       = p_option_b,
    option_c       = p_option_c,
    option_d       = p_option_d,
    correct_option = p_correct_option,
    explanation    = p_explanation,
    difficulty     = p_difficulty
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_submission(uuid, text, text, text, text, text, text, text, text) TO authenticated;

-- ─── admin_review_submission — use submission's difficulty instead of 'medium' ─

CREATE OR REPLACE FUNCTION admin_review_submission(
  p_id           uuid,
  p_status       text,
  p_featured_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status  text;
  v_question_id     uuid;
  v_opt_a_id        uuid;
  v_opt_b_id        uuid;
  v_opt_c_id        uuid;
  v_opt_d_id        uuid;
  v_correct_opt_id  uuid;
  v_sub             record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT qs.status, qs.prompt, qs.option_a, qs.option_b, qs.option_c, qs.option_d,
         qs.correct_option, qs.explanation, qs.category_id, qs.user_id, qs.difficulty
  INTO v_sub
  FROM question_submissions qs
  WHERE qs.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  v_current_status := v_sub.status;

  UPDATE question_submissions
  SET
    status        = p_status,
    featured_date = COALESCE(p_featured_date, featured_date),
    reviewed_by   = auth.uid(),
    reviewed_at   = now()
  WHERE id = p_id;

  IF p_status = 'approved' AND v_current_status <> 'approved' THEN

    v_question_id := gen_random_uuid();
    INSERT INTO questions (id, prompt, explanation, category_id, question_type, difficulty, is_active, created_at)
    VALUES (
      v_question_id,
      v_sub.prompt,
      v_sub.explanation,
      v_sub.category_id,
      'multiple_choice',
      COALESCE(v_sub.difficulty, 'medium'),
      true,
      now()
    );

    v_opt_a_id := gen_random_uuid();
    v_opt_b_id := gen_random_uuid();
    v_opt_c_id := gen_random_uuid();
    v_opt_d_id := gen_random_uuid();

    INSERT INTO question_options (id, question_id, option_text, sort_order) VALUES
      (v_opt_a_id, v_question_id, v_sub.option_a, 0),
      (v_opt_b_id, v_question_id, v_sub.option_b, 1),
      (v_opt_c_id, v_question_id, v_sub.option_c, 2),
      (v_opt_d_id, v_question_id, v_sub.option_d, 3);

    v_correct_opt_id := CASE v_sub.correct_option
      WHEN 'a' THEN v_opt_a_id
      WHEN 'b' THEN v_opt_b_id
      WHEN 'c' THEN v_opt_c_id
      WHEN 'd' THEN v_opt_d_id
    END;

    INSERT INTO question_answers (question_id, correct_option_id)
    VALUES (v_question_id, v_correct_opt_id);

    UPDATE question_submissions
    SET question_id = v_question_id
    WHERE id = p_id;

    IF v_sub.user_id IS NOT NULL THEN
      INSERT INTO notifications (id, user_id, type, payload, created_at)
      VALUES (
        gen_random_uuid(),
        v_sub.user_id,
        'submission_approved',
        jsonb_build_object(
          'prompt', v_sub.prompt,
          'message', 'You knew something we didn''t — thanks for sharing it!'
        ),
        now()
      );
    END IF;

  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION admin_review_submission(uuid, text, date) TO authenticated;
