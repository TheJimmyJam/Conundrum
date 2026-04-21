export type GameMode = 'daily' | 'endless'
export type SessionStatus = 'active' | 'completed' | 'abandoned'
export type QuestionType = 'multiple_choice' | 'true_false'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type ChallengeStatus = 'pending' | 'accepted' | 'completed'
export type NotificationType = 'challenge_received' | 'beaten_on_leaderboard' | 'daily_available'

export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  role: 'player' | 'admin'
  created_at: string
}

export interface Category {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
}

export interface Question {
  id: string
  category_id: string
  prompt: string
  question_type: QuestionType
  difficulty: Difficulty
  explanation: string | null
  is_active: boolean
  created_at: string
}

export interface QuestionOption {
  id: string
  question_id: string
  option_text: string
  sort_order: number
}

export interface DailySet {
  id: string
  set_date: string
  title: string | null
  is_published: boolean
  created_at: string
}

export interface GameSession {
  id: string
  user_id: string
  daily_set_id: string | null
  mode: GameMode
  category_id: string | null
  started_at: string
  completed_at: string | null
  status: SessionStatus
  score: number
  correct_count: number
  question_count: number
  longest_streak: number
  duration_ms: number
  anti_cheat_flag: boolean
}

export interface Response {
  id: string
  game_session_id: string
  question_id: string
  selected_option_id: string
  answered_at: string
  response_time_ms: number
  is_correct: boolean
  points_awarded: number
}

export interface FriendChallenge {
  id: string
  challenger_user_id: string
  opponent_email: string | null
  opponent_user_id: string | null
  daily_set_id: string
  status: ChallengeStatus
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

// API response shapes
export interface LeaderboardEntry {
  rank: number
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  score: number
  correct_count: number
  duration_ms: number
}

export interface QuestionWithOptions extends Question {
  options: QuestionOption[]
  // Populated when question_stats is joined; undefined if not yet answered by anyone
  total_answers?: number
  correct_answers?: number
  difficulty_tier?: number | null  // 1 (easiest) – 10 (hardest), null = unranked
}

export interface FinalizeSessionPayload {
  session_id: string
  answers: Array<{
    question_id: string
    selected_option_id: string
    response_time_ms: number
  }>
}

export interface FinalizeSessionResult {
  score: number
  correct_count: number
  duration_ms: number
  question_results: Array<{
    question_id: string
    is_correct: boolean
    correct_option_id: string
    points_awarded: number
    explanation: string | null
  }>
}
