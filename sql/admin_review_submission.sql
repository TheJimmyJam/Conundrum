-- ─────────────────────────────────────────────────────────────────────────────
-- admin_review_submission
--
-- Approves or rejects a user-submitted question.
-- On approval:
--   - Promotes the question to the vault (questions table)
--   - Inserts the four answer options + correct answer
--   - Sends a submission_approved notification to the submitter
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch current submission state
  SELECT qs.status, qs.prompt, qs.option_a, qs.option_b, qs.option_c, qs.option_d,
         qs.correct_option, qs.explanation, qs.category_id, qs.user_id
  INTO v_sub
  FROM question_submissions qs
  WHERE qs.id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  v_current_status := v_sub.status;

  -- Update the submission record
  UPDATE question_submissions
  SET
    status        = p_status,
    featured_date = COALESCE(p_featured_date, featured_date),
    reviewed_by   = auth.uid(),
    reviewed_at   = now()
  WHERE id = p_id;

  -- ── Promote to vault when transitioning to approved ──────────────────────
  -- Only on first approval (don't double-insert if already approved)
  IF p_status = 'approved' AND v_current_status <> 'approved' THEN

    -- 1. Create the question
    v_question_id := gen_random_uuid();
    INSERT INTO questions (id, prompt, explanation, category_id, question_type, difficulty, is_active, created_at)
    VALUES (
      v_question_id,
      v_sub.prompt,
      v_sub.explanation,
      v_sub.category_id,
      'multiple_choice',
      'medium',
      true,
      now()
    );

    -- 2. Create the four options
    v_opt_a_id := gen_random_uuid();
    v_opt_b_id := gen_random_uuid();
    v_opt_c_id := gen_random_uuid();
    v_opt_d_id := gen_random_uuid();

    INSERT INTO question_options (id, question_id, option_text, sort_order) VALUES
      (v_opt_a_id, v_question_id, v_sub.option_a, 0),
      (v_opt_b_id, v_question_id, v_sub.option_b, 1),
      (v_opt_c_id, v_question_id, v_sub.option_c, 2),
      (v_opt_d_id, v_question_id, v_sub.option_d, 3);

    -- 3. Record the correct answer
    v_correct_opt_id := CASE v_sub.correct_option
      WHEN 'a' THEN v_opt_a_id
      WHEN 'b' THEN v_opt_b_id
      WHEN 'c' THEN v_opt_c_id
      WHEN 'd' THEN v_opt_d_id
    END;

    INSERT INTO question_answers (question_id, correct_option_id)
    VALUES (v_question_id, v_correct_opt_id);

    -- 4. Link the vault question back to the submission so community
    --    answers can feed into question_stats via the trigger
    UPDATE question_submissions
    SET question_id = v_question_id
    WHERE id = p_id;

    -- 5. Notify the submitter (only if they have an account)
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
