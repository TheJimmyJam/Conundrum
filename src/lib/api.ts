import { supabase } from './supabase'
import type {
  Profile,
  Category,
  DailySet,
  GameSession,
  LeaderboardEntry,
  FinalizeSessionPayload,
  FinalizeSessionResult,
  QuestionWithOptions,
} from '../types'

// ─── Profile ────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  return !data
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data ?? []
}

// ─── Daily Set ───────────────────────────────────────────────────────────────

export async function getTodaysDailySet(): Promise<DailySet | null> {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('daily_sets')
    .select('*')
    .eq('set_date', today)
    .eq('is_published', true)
    .maybeSingle()
  if (error) throw error
  return data
}

// ─── Game Sessions ───────────────────────────────────────────────────────────

export async function getExistingDailySession(userId: string, dailySetId: string): Promise<GameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('daily_set_id', dailySetId)
    .eq('status', 'completed')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createGameSession(
  userId: string,
  dailySetId: string | null,
  mode: 'daily' | 'endless',
  categoryId?: string | null
): Promise<GameSession> {
  const { data, error } = await supabase
    .from('game_sessions')
    .insert({
      user_id: userId,
      daily_set_id: dailySetId,
      mode,
      category_id: categoryId ?? null,
      status: 'active',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getSessionById(sessionId: string): Promise<GameSession | null> {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  if (error) throw error
  return data
}

export async function getSessionResponses(sessionId: string) {
  // Fetch responses with correct answers via security-definer RPC
  const { data: rows, error: rpcErr } = await supabase.rpc('get_session_responses', {
    p_session_id: sessionId,
  })
  if (rpcErr) throw rpcErr

  // Fetch options for all questions in this session
  const questionIds = (rows ?? []).map((r: any) => r.question_id)
  const { data: optRows, error: optErr } = await supabase
    .from('question_options')
    .select('id, question_id, option_text, sort_order')
    .in('question_id', questionIds)
  if (optErr) throw optErr

  const optsByQuestion = new Map<string, any[]>()
  for (const opt of optRows ?? []) {
    if (!optsByQuestion.has(opt.question_id)) optsByQuestion.set(opt.question_id, [])
    optsByQuestion.get(opt.question_id)!.push(opt)
  }

  return (rows ?? []).map((r: any) => ({
    question_id: r.question_id,
    selected_option_id: r.selected_option_id,
    correct_option_id: r.correct_option_id,
    is_correct: r.is_correct,
    points_awarded: r.points_awarded,
    response_time_ms: r.response_time_ms,
    prompt: r.prompt ?? '',
    explanation: r.explanation ?? null,
    options: (optsByQuestion.get(r.question_id) ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
  }))
}

export async function getMySessionHistory(userId: string, limit = 20) {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}

// ─── Daily Questions ─────────────────────────────────────────────────────────

export async function getDailySetQuestions(dailySetId: string): Promise<QuestionWithOptions[]> {
  const { data, error } = await supabase
    .from('daily_set_questions')
    .select(`
      position,
      questions (
        id, prompt, question_type, difficulty, explanation, category_id,
        question_options ( id, option_text, sort_order )
      )
    `)
    .eq('daily_set_id', dailySetId)
    .order('position')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    ...row.questions,
    options: row.questions.question_options ?? [],
  }))
}

// ─── Finalize Session (daily) ─────────────────────────────────────────────────

export async function finalizeSession(
  payload: FinalizeSessionPayload
): Promise<FinalizeSessionResult> {
  const { data, error } = await supabase.functions.invoke('finalize-session', {
    body: payload,
  })
  if (error) throw error
  return data
}

// ─── Endless Mode ─────────────────────────────────────────────────────────────

export async function getNextEndlessQuestion(sessionId: string): Promise<{
  done: boolean
  question?: QuestionWithOptions
}> {
  const { data, error } = await supabase.functions.invoke('get-next-question', {
    body: { session_id: sessionId },
  })
  if (error) throw error
  return data
}

export async function submitEndlessAnswer(payload: {
  session_id: string
  question_id: string
  selected_option_id: string
  response_time_ms: number
}) {
  const { data, error } = await supabase.functions.invoke('submit-endless-answer', {
    body: payload,
  })
  if (error) throw error
  return data
}

export async function endEndlessSession(sessionId: string) {
  const { data, error } = await supabase.functions.invoke('end-endless-session', {
    body: { session_id: sessionId },
  })
  if (error) throw error
  return data
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export async function getDailyLeaderboard(dailySetId: string, limit = 50): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_daily_leaderboard', {
    p_daily_set_id: dailySetId,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    rank: Number(row.rank),
    user_id: row.user_id,
    username: row.username ?? 'unknown',
    display_name: row.display_name ?? null,
    avatar_url: null,
    score: row.score,
    correct_count: row.correct_count,
    duration_ms: row.duration_ms,
  }))
}

export async function getMyDailyRank(dailySetId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('get_my_daily_rank', {
    p_daily_set_id: dailySetId,
  })
  if (error) return null
  return data ?? null
}

export async function getEndlessLifetimeStreaks(limit = 50): Promise<{ rank: number; user_id: string; username: string; display_name: string | null; best_streak: number }[]> {
  const { data, error } = await supabase.rpc('get_endless_lifetime_streaks', { p_limit: limit })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    rank: Number(r.rank),
    user_id: r.user_id,
    username: r.username ?? 'unknown',
    display_name: r.display_name ?? null,
    best_streak: Number(r.best_streak),
  }))
}

export async function getEndlessDailyStreaks(limit = 50): Promise<{ rank: number; user_id: string; username: string; display_name: string | null; best_streak: number }[]> {
  const { data, error } = await supabase.rpc('get_endless_daily_streaks', { p_limit: limit })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    rank: Number(r.rank),
    user_id: r.user_id,
    username: r.username ?? 'unknown',
    display_name: r.display_name ?? null,
    best_streak: Number(r.best_streak),
  }))
}

// ─── Challenges ──────────────────────────────────────────────────────────────

export async function createChallenge(
  challengerUserId: string,
  opponentEmail: string,
  dailySetId: string
) {
  const { data, error } = await supabase.functions.invoke('send-challenge', {
    body: {
      challenger_user_id: challengerUserId,
      opponent_email: opponentEmail,
      daily_set_id: dailySetId,
    },
  })
  if (error) throw error
  return data
}

export async function getChallengeByToken(token: string) {
  const { data, error } = await supabase
    .from('friend_challenges')
    .select(`
      *,
      challenger: profiles!challenger_user_id ( username, display_name ),
      daily_sets ( set_date, title )
    `)
    .eq('id', token)
    .maybeSingle()
  if (error) throw error
  return data
}
