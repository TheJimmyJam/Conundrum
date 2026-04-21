-- Add submission_approved to the notifications type constraint
-- and add an INSERT policy so SECURITY DEFINER functions can write rows.

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'challenge_received',
    'beaten_on_leaderboard',
    'daily_available',
    'submission_approved'
  ));

-- Allow service-role / SECURITY DEFINER functions to insert notifications
-- (existing RLS policies only cover SELECT and UPDATE for users)
CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);
