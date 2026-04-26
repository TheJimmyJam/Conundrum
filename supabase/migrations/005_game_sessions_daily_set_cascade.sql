-- Migration: Change game_sessions.daily_set_id FK to ON DELETE SET NULL
-- This allows daily sets to be deleted without blocking on existing game sessions.
-- Sessions that referenced the deleted set will have daily_set_id set to NULL.

ALTER TABLE game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_daily_set_id_fkey;

ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_daily_set_id_fkey
    FOREIGN KEY (daily_set_id)
    REFERENCES daily_sets(id)
    ON DELETE SET NULL;
