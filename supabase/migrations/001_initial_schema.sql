-- ============================================================
-- Conundrum — Initial Schema
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── PROFILES ────────────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text,
  avatar_url    text,
  role          text not null default 'player' check (role in ('player', 'admin')),
  created_at    timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── CATEGORIES ──────────────────────────────────────────────
create table categories (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text unique not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ─── QUESTIONS ───────────────────────────────────────────────
create table questions (
  id             uuid primary key default uuid_generate_v4(),
  category_id    uuid not null references categories(id),
  prompt         text not null,
  question_type  text not null default 'multiple_choice' check (question_type in ('multiple_choice', 'true_false')),
  difficulty     text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  explanation    text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ─── QUESTION OPTIONS ────────────────────────────────────────
create table question_options (
  id           uuid primary key default uuid_generate_v4(),
  question_id  uuid not null references questions(id) on delete cascade,
  option_text  text not null,
  sort_order   int not null default 0
);

-- ─── QUESTION ANSWERS (protected) ────────────────────────────
create table question_answers (
  question_id        uuid primary key references questions(id) on delete cascade,
  correct_option_id  uuid not null references question_options(id)
);

-- ─── DAILY SETS ──────────────────────────────────────────────
create table daily_sets (
  id           uuid primary key default uuid_generate_v4(),
  set_date     date unique not null,
  title        text,
  is_published boolean not null default false,
  created_at   timestamptz not null default now()
);

create table daily_set_questions (
  id            uuid primary key default uuid_generate_v4(),
  daily_set_id  uuid not null references daily_sets(id) on delete cascade,
  question_id   uuid not null references questions(id),
  position      int not null,
  unique (daily_set_id, position),
  unique (daily_set_id, question_id)
);

-- ─── GAME SESSIONS ───────────────────────────────────────────
create table game_sessions (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references profiles(id) on delete cascade,
  daily_set_id     uuid references daily_sets(id),
  mode             text not null default 'daily' check (mode in ('daily', 'endless')),
  category_id      uuid references categories(id),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  status           text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  score            int not null default 0,
  correct_count    int not null default 0,
  question_count   int not null default 0,
  longest_streak   int not null default 0,
  duration_ms      bigint not null default 0,
  anti_cheat_flag  boolean not null default false
);

-- One completed daily session per user per set
create unique index one_daily_per_user
  on game_sessions (user_id, daily_set_id)
  where status = 'completed' and mode = 'daily';

-- ─── RESPONSES ───────────────────────────────────────────────
create table responses (
  id                  uuid primary key default uuid_generate_v4(),
  game_session_id     uuid not null references game_sessions(id) on delete cascade,
  question_id         uuid not null references questions(id),
  selected_option_id  uuid references question_options(id),
  answered_at         timestamptz not null default now(),
  response_time_ms    int not null default 0,
  is_correct          boolean not null default false,
  points_awarded      int not null default 0
);

-- ─── FRIEND CHALLENGES ───────────────────────────────────────
create table friend_challenges (
  id                   uuid primary key default uuid_generate_v4(),
  challenger_user_id   uuid not null references profiles(id),
  opponent_email       text,
  opponent_user_id     uuid references profiles(id),
  daily_set_id         uuid not null references daily_sets(id),
  status               text not null default 'pending' check (status in ('pending', 'accepted', 'completed')),
  created_at           timestamptz not null default now()
);

-- ─── NOTIFICATIONS ───────────────────────────────────────────
create table notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  type        text not null check (type in ('challenge_received', 'beaten_on_leaderboard', 'daily_available')),
  payload     jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table categories enable row level security;
alter table questions enable row level security;
alter table question_options enable row level security;
alter table question_answers enable row level security;
alter table daily_sets enable row level security;
alter table daily_set_questions enable row level security;
alter table game_sessions enable row level security;
alter table responses enable row level security;
alter table friend_challenges enable row level security;
alter table notifications enable row level security;

-- profiles
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- categories (public read)
create policy "Anyone can read active categories" on categories for select using (is_active = true);

-- questions (public read, active only)
create policy "Anyone can read active questions" on questions for select using (is_active = true);

-- question_options (public read)
create policy "Anyone can read question options" on question_options for select using (true);

-- question_answers: NO policies = service role only
-- (no select policy means only service_role can read)

-- daily_sets (public read, published only)
create policy "Anyone can read published daily sets" on daily_sets for select using (is_published = true);

-- daily_set_questions (public read)
create policy "Anyone can read daily set questions" on daily_set_questions for select using (true);

-- game_sessions
create policy "Users can view own sessions" on game_sessions for select using (auth.uid() = user_id);
create policy "Users can insert own sessions" on game_sessions for insert with check (auth.uid() = user_id);

-- responses (Edge Function inserts via service role; users can read own)
create policy "Users can view own responses" on responses for select using (
  exists (select 1 from game_sessions where id = game_session_id and user_id = auth.uid())
);

-- friend_challenges
create policy "Users can view own challenges" on friend_challenges for select using (
  auth.uid() = challenger_user_id or auth.uid() = opponent_user_id
);
create policy "Users can create challenges" on friend_challenges for insert with check (auth.uid() = challenger_user_id);

-- notifications
create policy "Users can view own notifications" on notifications for select using (auth.uid() = user_id);
create policy "Users can mark notifications read" on notifications for update using (auth.uid() = user_id);

-- ============================================================
-- SEED DATA — Categories
-- ============================================================
insert into categories (name, slug) values
  ('General Knowledge', 'general-knowledge'),
  ('Science & Nature', 'science-nature'),
  ('History', 'history'),
  ('Sports', 'sports'),
  ('Pop Culture', 'pop-culture'),
  ('Texas & Dallas', 'texas-dallas'),
  ('Food & Drink', 'food-drink'),
  ('Geography', 'geography');
