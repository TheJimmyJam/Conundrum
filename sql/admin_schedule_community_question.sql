-- ─────────────────────────────────────────────────────────────────────────────
-- admin_schedule_question_as_community
--
-- Copies a question from the `questions` table into `question_submissions`,
-- auto-scheduling it as the next available community question slot
-- (MAX(featured_date) + 1 day, or tomorrow if queue is empty).
-- Returns the date it was scheduled for.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old signature that required a date param
DROP FUNCTION IF EXISTS admin_schedule_question_as_community(uuid, date);

CREATE OR REPLACE FUNCTION admin_schedule_question_as_community(
  p_question_id uuid
)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_date      date;
  v_last_featured  date;
  v_eligible_on    date;
  v_prompt         text;
  v_explanation    text;
  v_correct_id     uuid;
  v_correct_sort   int;
  v_correct_ltr    text;
  v_opts           text[];
BEGIN
  -- Admin guard
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 365-day cooldown: block if this question was featured in the last year
  SELECT MAX(featured_date)
  INTO v_last_featured
  FROM question_submissions
  WHERE question_id = p_question_id
    AND featured_date IS NOT NULL
    AND featured_date <= CURRENT_DATE;   -- only past/today, not future queued dates

  IF v_last_featured IS NOT NULL AND v_last_featured > CURRENT_DATE - INTERVAL '365 days' THEN
    v_eligible_on := v_last_featured + INTERVAL '365 days';
    RAISE EXCEPTION 'This question was last featured on %. It cannot be queued again until %.', v_last_featured, v_eligible_on;
  END IF;

  -- Find next available slot: day after the last scheduled featured_date
  SELECT COALESCE(MAX(featured_date), CURRENT_DATE) + 1
  INTO v_next_date
  FROM question_submissions
  WHERE status = 'featured'
    AND featured_date >= CURRENT_DATE;

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
    status, featured_date,
    question_id
  ) VALUES (
    auth.uid(),
    'admin',
    v_prompt,
    v_opts[1], v_opts[2], v_opts[3], v_opts[4],
    v_correct_ltr,
    COALESCE(v_explanation, ''),
    'featured',
    v_next_date,
    p_question_id
  );

  RETURN v_next_date;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_schedule_question_as_community(uuid) TO authenticated;
