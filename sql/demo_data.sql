-- ─────────────────────────────────────────────────────────────────────────────
-- Demo Data: generate fake users + leaderboard scores for presentation
-- All demo users have email ending in @demo.conundrum.test — used as marker
-- Deleting from auth.users cascades to profiles and game_sessions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_generate_demo_users(p_count int DEFAULT 150)
RETURNS TABLE (generated int, daily_set_date date, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid;
  v_username      text;
  v_display_name  text;
  v_daily_set_id  uuid;
  v_daily_date    date;
  v_score         int;
  v_correct       int;
  v_duration      bigint;
  v_rand          float;
  v_adj           text[];
  v_noun          text[];
  i               int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Find most recent published daily set
  SELECT ds.id, ds.set_date INTO v_daily_set_id, v_daily_date
  FROM daily_sets ds
  WHERE ds.is_published = true
  ORDER BY ds.set_date DESC
  LIMIT 1;

  IF v_daily_set_id IS NULL THEN
    RAISE EXCEPTION 'No published daily set found. Publish a daily set first.';
  END IF;

  -- Word banks for display names
  v_adj  := ARRAY['Cosmic','Quantum','Shadow','Stellar','Pixel','Neon','Cyber','Arctic',
                  'Solar','Dark','Swift','Silent','Iron','Frost','Storm','Fire',
                  'Thunder','Ghost','Blade','Turbo','Rogue','Hyper','Stealth','Vortex',
                  'Blaze','Crystal','Atomic','Echo','Phantom','Rapid'];
  v_noun := ARRAY['Wolf','Fox','Eagle','Hawk','Tiger','Lion','Bear','Falcon',
                  'Raven','Shark','Comet','Nova','Mind','Cipher','Code','Quest',
                  'Sage','Grid','Bolt','Specter','Riddle','Logic','Wit','Ace',
                  'Maverick','Coder','Solver','Thinker','Guru','Oracle'];

  FOR i IN 1..p_count LOOP
    v_user_id := gen_random_uuid();

    -- Unique username from UUID
    v_username := 'demo_' || substr(replace(v_user_id::text, '-', ''), 1, 12);

    -- Fun display name: Adjective + Noun + 2-digit number
    v_display_name :=
      v_adj[  1 + (floor(random() * array_length(v_adj,  1)))::int ] ||
      v_noun[ 1 + (floor(random() * array_length(v_noun, 1)))::int ] ||
      lpad((floor(random() * 99 + 1))::int::text, 2, '0');

    -- Insert auth user (triggers handle_new_user → creates profile)
    INSERT INTO auth.users (
      id, instance_id, aud, role,
      email, encrypted_password,
      email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change_token_new, recovery_token,
      is_sso_user, is_anonymous
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      v_username || '@demo.conundrum.test',
      '',
      now() - (random() * interval '180 days'),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('username', v_username, 'is_demo', true),
      now() - (random() * interval '180 days'),
      now(),
      '', '', '',
      false, false
    )
    ON CONFLICT (email) DO NOTHING;

    -- Update display name (trigger already created profile with username)
    UPDATE profiles SET display_name = v_display_name WHERE profiles.id = v_user_id;

    -- Realistic score distribution (bell-curve centered ~7/10)
    v_rand    := random();
    v_correct := CASE
      WHEN v_rand < 0.02 THEN 10
      WHEN v_rand < 0.07 THEN 9
      WHEN v_rand < 0.18 THEN 8
      WHEN v_rand < 0.38 THEN 7
      WHEN v_rand < 0.62 THEN 6
      WHEN v_rand < 0.78 THEN 5
      WHEN v_rand < 0.88 THEN 4
      WHEN v_rand < 0.94 THEN 3
      WHEN v_rand < 0.97 THEN 2
      WHEN v_rand < 0.99 THEN 1
      ELSE 0
    END;

    -- Duration: 25s–4min; faster players score more per correct answer
    v_duration := (25000 + floor(random() * 215000))::bigint;

    -- Score = base per correct + speed bonus (faster = more points)
    v_score := (v_correct * 100) +
               CASE WHEN v_duration < 45000  THEN v_correct * 55
                    WHEN v_duration < 90000  THEN v_correct * 35
                    WHEN v_duration < 150000 THEN v_correct * 18
                    ELSE                          v_correct * 8
               END;

    -- Insert completed game session (skip if conflict)
    INSERT INTO game_sessions (
      user_id, daily_set_id, mode, status,
      score, correct_count, question_count, longest_streak, duration_ms,
      started_at, completed_at
    ) VALUES (
      v_user_id, v_daily_set_id, 'daily', 'completed',
      v_score, v_correct, 10,
      LEAST(v_correct, 5 + floor(random() * 6)::int),
      v_duration,
      now() - interval '2 hours' - (random() * interval '20 hours'),
      now() - interval '1 hour'  - (random() * interval '20 hours')
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN QUERY SELECT p_count, v_daily_date, 
    format('Generated %s demo users for %s', p_count, v_daily_date::text);
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Remove all demo users (cascades to profiles + game_sessions)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_remove_demo_users()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM auth.users
  WHERE auth.users.email LIKE '%@demo.conundrum.test';

  DELETE FROM auth.users
  WHERE auth.users.email LIKE '%@demo.conundrum.test';

  RETURN v_count;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Count current demo users
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_count_demo_users()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM auth.users
  WHERE auth.users.email LIKE '%@demo.conundrum.test';

  RETURN v_count;
END;
$$;
