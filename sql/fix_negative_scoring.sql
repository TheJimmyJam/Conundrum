-- Fix: allow negative points_awarded in responses (wrong answer penalties are -200 to -350)
-- Run this in Supabase Dashboard → SQL Editor

-- Drop any CHECK constraint preventing negative points_awarded
ALTER TABLE responses DROP CONSTRAINT IF EXISTS responses_points_awarded_check;

-- Drop any CHECK constraint preventing negative score (endless mode score can dip below 0)
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_score_check;

-- Confirm no remaining constraints block negative values
-- (optional — just for visibility)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('responses'::regclass, 'game_sessions'::regclass)
  AND contype = 'c';
