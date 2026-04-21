-- ─────────────────────────────────────────────────────────────────────────────
-- Endless difficulty filter
--
-- Adds a difficulty_filter text[] column to game_sessions so a player's
-- chosen difficulties (easy / medium / hard, any combo) are stored on the
-- session and respected when picking the next question.
-- NULL = no filter = all difficulties.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS difficulty_filter text[] DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Updated get_endless_question: respects difficulty_filter from the session
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_endless_question(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         uuid := auth.uid();
  v_category_id     uuid;
  v_difficulty_filter text[];
  v_question_id     uuid;
  v_result          jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Verify session belongs to this user and is active
  SELECT category_id, difficulty_filter
  INTO v_category_id, v_difficulty_filter
  FROM game_sessions
  WHERE id      = p_session_id
    AND user_id = v_user_id
    AND status  = 'active'
    AND mode    = 'endless';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Session not found');
  END IF;

  -- Pick a random question the user has never answered, respecting filters
  SELECT q.id INTO v_question_id
  FROM questions q
  WHERE q.is_active = true
    AND (v_category_id IS NULL OR q.category_id = v_category_id)
    AND (v_difficulty_filter IS NULL OR q.difficulty = ANY(v_difficulty_filter))
    AND NOT EXISTS (
      SELECT 1
      FROM responses r
      JOIN game_sessions gs ON r.game_session_id = gs.id
      WHERE gs.user_id    = v_user_id
        AND r.question_id = q.id
    )
  ORDER BY random()
  LIMIT 1;

  IF v_question_id IS NULL THEN
    RETURN jsonb_build_object('done', true);
  END IF;

  -- Build full response with nested options
  SELECT jsonb_build_object(
    'done', false,
    'question', jsonb_build_object(
      'id',            q.id,
      'prompt',        q.prompt,
      'question_type', q.question_type,
      'difficulty',    q.difficulty,
      'explanation',   q.explanation,
      'category_id',   q.category_id,
      'options', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',          opt.id,
            'option_text', opt.option_text,
            'sort_order',  opt.sort_order
          ) ORDER BY opt.sort_order
        )
        FROM question_options opt
        WHERE opt.question_id = q.id
      )
    )
  ) INTO v_result
  FROM questions q
  WHERE q.id = v_question_id;

  RETURN v_result;
END;
$$;
