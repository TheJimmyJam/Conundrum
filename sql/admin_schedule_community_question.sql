-- ─────────────────────────────────────────────────────────────────────────────
-- admin_schedule_question_as_community
--
-- Copies a question from the `questions` table into `question_submissions`
-- with a specific featured_date, scheduling it as the community question of
-- the day. Errors if that date already has a community question scheduled.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_schedule_question_as_community(
  p_question_id uuid,
  p_date        date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prompt       text;
  v_explanation  text;
  v_correct_id   uuid;
  v_correct_sort int;
  v_correct_ltr  text;
  v_opts         text[];
BEGIN
  -- Admin guard
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Block if date already has a scheduled community question
  IF EXISTS (
    SELECT 1 FROM question_submissions
    WHERE featured_date = p_date
      AND status IN ('featured', 'approved')
      AND featured_date IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A community question is already scheduled for %', p_date;
  END IF;

  -- Fetch question
  SELECT q.prompt, q.explanation
  INTO v_prompt, v_explanation
  FROM questions q
  WHERE q.id = p_question_id;

  IF v_prompt IS NULL THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  -- Fetch correct option ID
  SELECT qa.correct_option_id
  INTO v_correct_id
  FROM question_answers qa
  WHERE qa.question_id = p_question_id
  LIMIT 1;

  -- Find correct option's sort_order (0-indexed)
  SELECT qo.sort_order
  INTO v_correct_sort
  FROM question_options qo
  WHERE qo.id = v_correct_id;

  -- Map 0-indexed sort_order → letter
  v_correct_ltr := CASE v_correct_sort
    WHEN 0 THEN 'a'
    WHEN 1 THEN 'b'
    WHEN 2 THEN 'c'
    ELSE 'd'
  END;

  -- Collect options in order (sort_order 0,1,2,3)
  SELECT ARRAY_AGG(option_text ORDER BY sort_order)
  INTO v_opts
  FROM question_options
  WHERE question_id = p_question_id;

  -- Insert into community question queue
  INSERT INTO question_submissions (
    user_id, username,
    prompt,
    option_a, option_b, option_c, option_d,
    correct_option, explanation,
    status, featured_date
  ) VALUES (
    auth.uid(),
    'admin',
    v_prompt,
    v_opts[1], v_opts[2], v_opts[3], v_opts[4],
    v_correct_ltr,
    COALESCE(v_explanation, ''),
    'featured',
    p_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_schedule_question_as_community(uuid, date) TO authenticated;
