-- ─────────────────────────────────────────────────────────────────────────────
-- Sync community question answers → question_stats
--
-- When a user answers the daily community question, the answer is recorded
-- in community_question_answers (keyed to question_submissions). This trigger
-- fires after each insert and upserts the corresponding question_stats row
-- so the vault question accumulates real answer data for the Einstein Scale.
--
-- Requires: question_submissions.question_id links to questions.id
-- (set by admin_review_submission when a submission is approved to the vault)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_community_answer_to_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question_id uuid;
BEGIN
  -- Look up which vault question this submission maps to
  SELECT qs.question_id INTO v_question_id
  FROM question_submissions qs
  WHERE qs.id = NEW.submission_id;

  -- No vault question linked (e.g. submission was featured without vault approval) → skip
  IF v_question_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Upsert into question_stats
  INSERT INTO question_stats (question_id, total_answers, correct_answers)
  VALUES (
    v_question_id,
    1,
    CASE WHEN NEW.is_correct THEN 1 ELSE 0 END
  )
  ON CONFLICT (question_id) DO UPDATE
  SET
    total_answers   = question_stats.total_answers + 1,
    correct_answers = question_stats.correct_answers + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END;

  RETURN NEW;
END;
$$;

-- Drop and recreate so it's idempotent
DROP TRIGGER IF EXISTS trg_sync_community_answer ON community_question_answers;

CREATE TRIGGER trg_sync_community_answer
AFTER INSERT ON community_question_answers
FOR EACH ROW EXECUTE FUNCTION sync_community_answer_to_stats();
