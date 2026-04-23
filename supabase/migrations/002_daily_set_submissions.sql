-- ─── Daily Set Submissions ───────────────────────────────────────────────────
-- Community members can submit a full 10-question set that, once approved by
-- an admin, gets added to the question vault and can be scheduled as a daily.

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_set_submissions (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  username      text        NOT NULL,
  title         text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes   text,
  reviewed_by   uuid        REFERENCES profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_set_submission_questions (
  id                uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  set_submission_id uuid    REFERENCES daily_set_submissions(id) ON DELETE CASCADE NOT NULL,
  position          int     NOT NULL CHECK (position BETWEEN 1 AND 10),
  prompt            text    NOT NULL,
  option_a          text    NOT NULL,
  option_b          text    NOT NULL,
  option_c          text    NOT NULL,
  option_d          text    NOT NULL,
  correct_option    text    NOT NULL CHECK (correct_option IN ('a', 'b', 'c', 'd')),
  explanation       text,
  category_id       uuid    REFERENCES categories(id),
  vault_question_id uuid    REFERENCES questions(id),
  UNIQUE (set_submission_id, position)
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE daily_set_submissions ENABLE ROW LEVEL SECURITY;

-- Users see their own submissions
CREATE POLICY "dss_select_own" ON daily_set_submissions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "dss_insert_own" ON daily_set_submissions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins see and can modify all
CREATE POLICY "dss_admin_all" ON daily_set_submissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE daily_set_submission_questions ENABLE ROW LEVEL SECURITY;

-- Users see questions from their own submissions
CREATE POLICY "dssq_select_own" ON daily_set_submission_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM daily_set_submissions
      WHERE id = set_submission_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "dssq_insert_own" ON daily_set_submission_questions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_set_submissions
      WHERE id = set_submission_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "dssq_admin_all" ON daily_set_submission_questions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── RPC: submit_daily_set ────────────────────────────────────────────────────
-- Called by logged-in users. Atomically inserts the set header + 10 questions.

CREATE OR REPLACE FUNCTION submit_daily_set(
  p_title     text,
  p_questions jsonb   -- array of 10 question objects
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_username  text;
  v_set_id    uuid;
  v_q         jsonb;
  v_pos       int := 1;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not logged in';
  END IF;

  SELECT username INTO v_username FROM profiles WHERE id = v_user_id;

  INSERT INTO daily_set_submissions (user_id, username, title)
  VALUES (v_user_id, COALESCE(v_username, 'unknown'), p_title)
  RETURNING id INTO v_set_id;

  FOR v_q IN SELECT * FROM jsonb_array_elements(p_questions) LOOP
    INSERT INTO daily_set_submission_questions (
      set_submission_id, position,
      prompt, option_a, option_b, option_c, option_d,
      correct_option, explanation, category_id
    ) VALUES (
      v_set_id, v_pos,
      v_q->>'prompt',
      v_q->>'option_a', v_q->>'option_b', v_q->>'option_c', v_q->>'option_d',
      v_q->>'correct_option',
      NULLIF(v_q->>'explanation', ''),
      NULLIF(v_q->>'category_id', '')::uuid
    );
    v_pos := v_pos + 1;
  END LOOP;

  RETURN v_set_id;
END;
$$;

-- ─── RPC: admin_get_daily_set_submissions ────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_get_daily_set_submissions(
  p_status text DEFAULT NULL
) RETURNS TABLE (
  id             uuid,
  user_id        uuid,
  username       text,
  title          text,
  status         text,
  admin_notes    text,
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  created_at     timestamptz,
  question_count int
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    dss.id, dss.user_id, dss.username, dss.title,
    dss.status, dss.admin_notes, dss.reviewed_by, dss.reviewed_at, dss.created_at,
    COUNT(dssq.id)::int AS question_count
  FROM daily_set_submissions dss
  LEFT JOIN daily_set_submission_questions dssq ON dssq.set_submission_id = dss.id
  WHERE (p_status IS NULL OR dss.status = p_status)
  GROUP BY dss.id
  ORDER BY dss.created_at DESC;
END;
$$;

-- ─── RPC: admin_get_daily_set_submission_questions ───────────────────────────

CREATE OR REPLACE FUNCTION admin_get_daily_set_submission_questions(
  p_set_id uuid
) RETURNS TABLE (
  id                uuid,
  position          int,
  prompt            text,
  option_a          text,
  option_b          text,
  option_c          text,
  option_d          text,
  correct_option    text,
  explanation       text,
  category_id       uuid,
  category_name     text,
  vault_question_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    dssq.id, dssq.position,
    dssq.prompt, dssq.option_a, dssq.option_b, dssq.option_c, dssq.option_d,
    dssq.correct_option, dssq.explanation,
    dssq.category_id, c.name AS category_name,
    dssq.vault_question_id
  FROM daily_set_submission_questions dssq
  LEFT JOIN categories c ON c.id = dssq.category_id
  WHERE dssq.set_submission_id = p_set_id
  ORDER BY dssq.position;
END;
$$;

-- ─── RPC: admin_review_daily_set_submission ──────────────────────────────────
-- On approval: creates 10 vault questions + links them back to the submission.
-- Returns JSON with the vault question_ids so the admin can then schedule.

CREATE OR REPLACE FUNCTION admin_review_daily_set_submission(
  p_id      uuid,
  p_status  text,         -- 'approved' | 'rejected'
  p_notes   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_admin_id    uuid := auth.uid();
  v_q           record;
  v_question_id uuid;
  v_opt_a_id    uuid;
  v_opt_b_id    uuid;
  v_opt_c_id    uuid;
  v_opt_d_id    uuid;
  v_correct_id  uuid;
  v_question_ids uuid[] := '{}';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: must be approved or rejected';
  END IF;

  UPDATE daily_set_submissions
  SET status      = p_status,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      admin_notes = p_notes
  WHERE id = p_id;

  IF p_status = 'approved' THEN
    FOR v_q IN
      SELECT * FROM daily_set_submission_questions
      WHERE set_submission_id = p_id
      ORDER BY position
    LOOP
      -- Vault question
      INSERT INTO questions (prompt, explanation, category_id, question_type, difficulty, is_active)
      VALUES (v_q.prompt, v_q.explanation, v_q.category_id, 'multiple_choice', 'medium', true)
      RETURNING id INTO v_question_id;

      -- Options
      INSERT INTO question_options (question_id, option_text, sort_order)
        VALUES (v_question_id, v_q.option_a, 0) RETURNING id INTO v_opt_a_id;
      INSERT INTO question_options (question_id, option_text, sort_order)
        VALUES (v_question_id, v_q.option_b, 1) RETURNING id INTO v_opt_b_id;
      INSERT INTO question_options (question_id, option_text, sort_order)
        VALUES (v_question_id, v_q.option_c, 2) RETURNING id INTO v_opt_c_id;
      INSERT INTO question_options (question_id, option_text, sort_order)
        VALUES (v_question_id, v_q.option_d, 3) RETURNING id INTO v_opt_d_id;

      -- Correct answer link
      v_correct_id := CASE v_q.correct_option
        WHEN 'a' THEN v_opt_a_id
        WHEN 'b' THEN v_opt_b_id
        WHEN 'c' THEN v_opt_c_id
        WHEN 'd' THEN v_opt_d_id
      END;
      INSERT INTO question_answers (question_id, correct_option_id)
        VALUES (v_question_id, v_correct_id);

      -- Back-link the vault question
      UPDATE daily_set_submission_questions
      SET vault_question_id = v_question_id
      WHERE id = v_q.id;

      v_question_ids := array_append(v_question_ids, v_question_id);
    END LOOP;

    RETURN jsonb_build_object('question_ids', to_jsonb(v_question_ids));
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

-- ─── RPC: admin_create_set_from_submission ───────────────────────────────────
-- Creates a draft daily_set (unpublished) pre-loaded with the 10 vault
-- questions from an approved community submission.  Admin can then open it
-- in AdminDailySet to reorder, swap questions, assign a final date, publish.

CREATE OR REPLACE FUNCTION admin_create_set_from_submission(
  p_submission_id uuid,
  p_date          date,
  p_title         text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_set_id   uuid;
  v_title    text;
  v_q        record;
  v_slot     int := 1;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Must be approved first
  IF NOT EXISTS (
    SELECT 1 FROM daily_set_submissions WHERE id = p_submission_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Submission must be approved before scheduling';
  END IF;

  SELECT COALESCE(p_title, title) INTO v_title
  FROM daily_set_submissions WHERE id = p_submission_id;

  INSERT INTO daily_sets (set_date, title, is_published)
  VALUES (p_date, v_title, false)
  RETURNING id INTO v_set_id;

  FOR v_q IN
    SELECT vault_question_id
    FROM daily_set_submission_questions
    WHERE set_submission_id = p_submission_id
      AND vault_question_id IS NOT NULL
    ORDER BY position
  LOOP
    INSERT INTO daily_set_questions (daily_set_id, question_id, position)
    VALUES (v_set_id, v_q.vault_question_id, v_slot);
    v_slot := v_slot + 1;
  END LOOP;

  RETURN v_set_id;
END;
$$;
