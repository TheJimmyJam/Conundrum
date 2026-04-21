-- ─────────────────────────────────────────────────────────────────────────────
-- Question Stats: tracks lifetime correct/wrong counts per question
-- Tier names (1=easiest, 10=hardest), assigned via NTILE(10) in admin view
-- ─────────────────────────────────────────────────────────────────────────────

-- Table
CREATE TABLE IF NOT EXISTS question_stats (
  question_id      uuid PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  total_answers    int  NOT NULL DEFAULT 0,
  correct_answers  int  NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE question_stats ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for join in game queries)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'question_stats' AND policyname = 'Anyone can read question stats'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can read question stats" ON question_stats FOR SELECT USING (true)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: increment stats on every response insert
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_question_stats_on_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO question_stats (question_id, total_answers, correct_answers, updated_at)
  VALUES (
    NEW.question_id,
    1,
    CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (question_id) DO UPDATE SET
    total_answers   = question_stats.total_answers + 1,
    correct_answers = question_stats.correct_answers + (CASE WHEN NEW.is_correct THEN 1 ELSE 0 END),
    updated_at      = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_question_stats ON responses;
CREATE TRIGGER trg_update_question_stats
  AFTER INSERT ON responses
  FOR EACH ROW EXECUTE FUNCTION update_question_stats_on_response();

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: populate from all existing responses
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO question_stats (question_id, total_answers, correct_answers, updated_at)
SELECT
  question_id,
  COUNT(*)                                                AS total_answers,
  SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int       AS correct_answers,
  now()
FROM responses
GROUP BY question_id
ON CONFLICT (question_id) DO UPDATE SET
  total_answers   = EXCLUDED.total_answers,
  correct_answers = EXCLUDED.correct_answers,
  updated_at      = EXCLUDED.updated_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- Admin RPC: ranked question list using NTILE(10) percentile buckets
-- Tier 1 = easiest (highest correct rate), Tier 10 = hardest (lowest)
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop first so we can change the return type definition cleanly
DROP FUNCTION IF EXISTS admin_get_question_rankings(int, int, int, uuid);

CREATE FUNCTION admin_get_question_rankings(
  p_limit       int  DEFAULT 100,
  p_offset      int  DEFAULT 0,
  p_tier        int  DEFAULT NULL,
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE (
  question_id      uuid,
  prompt           text,
  category         text,
  total_answers    int,
  correct_answers  int,
  correct_rate     numeric,
  wilson_score     numeric,   -- 0–100, higher = more confidently easy
  overall_rank     bigint,    -- 1 = easiest across all ranked questions
  tier             int,
  tier_name        text,
  total_ranked     bigint
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
  WITH scored AS (
    SELECT
      qs.question_id,
      q.prompt,
      c.name                                                              AS category,
      qs.total_answers,
      qs.correct_answers,
      ROUND(qs.correct_answers::numeric / qs.total_answers, 4)           AS correct_rate,
      qs.correct_answers::numeric / qs.total_answers                     AS p,
      qs.total_answers::numeric                                          AS n
    FROM question_stats qs
    JOIN questions  q ON q.id  = qs.question_id
    JOIN categories c ON c.id  = q.category_id
    WHERE qs.total_answers > 0
      AND (p_category_id IS NULL OR q.category_id = p_category_id)
  ),
  wilson AS (
    -- Wilson score lower bound (z=1.96), scaled 0–100
    SELECT
      s.*,
      ROUND(
        100 * (
          (s.p + 3.8416 / (2 * s.n)
           - 1.96 * SQRT(s.p * (1 - s.p) / s.n + 3.8416 / (4 * s.n * s.n))
          ) / (1 + 3.8416 / s.n)
        )::numeric, 1
      )                                                                   AS wilson_score
    FROM scored s
  ),
  ranked AS (
    SELECT
      w.*,
      NTILE(10) OVER (ORDER BY w.wilson_score DESC)                      AS tier,
      ROW_NUMBER() OVER (ORDER BY w.wilson_score DESC)                   AS overall_rank
    FROM wilson w
  ),
  total_count AS (SELECT COUNT(*) AS cnt FROM ranked)
  SELECT
    ranked.question_id,
    ranked.prompt,
    ranked.category,
    ranked.total_answers,
    ranked.correct_answers,
    ranked.correct_rate,
    ranked.wilson_score,
    ranked.overall_rank,
    ranked.tier,
    CASE ranked.tier
      WHEN 1  THEN 'Initiate'
      WHEN 2  THEN 'Solver'
      WHEN 3  THEN 'Challenger'
      WHEN 4  THEN 'Decoder'
      WHEN 5  THEN 'Architect'
      WHEN 6  THEN 'Theorist'
      WHEN 7  THEN 'Cryptic Mind'
      WHEN 8  THEN 'Paradox Solver'
      WHEN 9  THEN 'Conundrum Elite'
      WHEN 10 THEN 'The Oracle'
    END                                                                   AS tier_name,
    total_count.cnt                                                       AS total_ranked
  FROM ranked, total_count
  WHERE (p_tier IS NULL OR ranked.tier = p_tier)
  ORDER BY ranked.overall_rank ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_question_rankings(int, int, int, uuid) TO authenticated;
