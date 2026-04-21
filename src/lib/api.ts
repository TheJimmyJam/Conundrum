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

export async function getDailyLeaderboardFriends(dailySetId: string, limit = 50): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('get_daily_leaderboard_friends', {
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

// ─── Friends ─────────────────────────────────────────────────────────────────

export async function searchUsers(query: string) {
  const { data, error } = await supabase.rpc('find_user_by_username_or_email', { p_query: query })
  if (error) throw error
  return (data ?? []) as { id: string; username: string; display_name: string | null }[]
}

export async function sendFriendRequest(addresseeId: string) {
  const { data, error } = await supabase.from('friendships').insert({ addressee_id: addresseeId }).select().single()
  if (error) throw error
  return data
}

export async function respondToFriendRequest(friendshipId: string, accept: boolean) {
  const { error } = await supabase.from('friendships')
    .update({ status: accept ? 'accepted' : 'declined' }).eq('id', friendshipId)
  if (error) throw error
}

export async function removeFriend(friendshipId: string) {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
  if (error) throw error
}

export async function getFriendships() {
  const { data, error } = await supabase.from('friendships').select(`
    id, status, created_at,
    requester:profiles!friendships_requester_id_fkey ( id, username, display_name ),
    addressee:profiles!friendships_addressee_id_fkey ( id, username, display_name )
  `).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as any[]
}

// ─── Challenges ──────────────────────────────────────────────────────────────

export async function createChallenge(challengedId: string): Promise<{ challenge_id: string; session_id: string; questions: any[] }> {
  const { data, error } = await supabase.functions.invoke('create-challenge', { body: { challenged_id: challengedId } })
  if (error) throw error
  return data
}

export async function startChallenge(challengeId: string): Promise<{ session_id: string; questions: any[] }> {
  const { data, error } = await supabase.functions.invoke('start-challenge', { body: { challenge_id: challengeId } })
  if (error) throw error
  return data
}

export async function finalizeChallenge(payload: {
  challenge_id: string
  session_id: string
  answers: { question_id: string; selected_option_id: string; response_time_ms: number }[]
}) {
  const { data, error } = await supabase.functions.invoke('finalize-challenge', { body: payload })
  if (error) throw error
  return data
}

export async function getMyChallenges() {
  const { data, error } = await supabase.from('challenges').select(`
    id, status, winner_id, created_at, expires_at,
    challenger:profiles!challenges_challenger_id_fkey ( id, username, display_name ),
    challenged:profiles!challenges_challenged_id_fkey ( id, username, display_name ),
    challenger_session:game_sessions!challenges_challenger_session_id_fkey ( score, correct_count, duration_ms ),
    challenged_session:game_sessions!challenges_challenged_session_id_fkey ( score, correct_count, duration_ms )
  `).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as any[]
}

export async function declineChallenge(challengeId: string) {
  const { error } = await supabase.from('challenges').update({ status: 'declined' }).eq('id', challengeId)
  if (error) throw error
}

// ─── Question Submissions ─────────────────────────────────────────────────────

export async function submitQuestion(payload: {
  prompt: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  explanation: string | null
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  const { error } = await supabase.from('question_submissions').insert({
    user_id: user.id,
    username: profile?.username ?? user.email?.split('@')[0] ?? 'unknown',
    ...payload,
  })
  if (error) throw error
}

export async function getMySubmissions() {
  const { data, error } = await supabase
    .from('question_submissions')
    .select('id, prompt, status, featured_date, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getFeaturedSubmission(date?: string): Promise<{
  id: string
  username: string
  prompt: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  explanation: string | null
  featured_date: string
} | null> {
  const { data, error } = await supabase.rpc('get_featured_submission', {
    p_date: date ?? new Date().toISOString().split('T')[0],
  })
  if (error) throw error
  return (data ?? [])[0] ?? null
}

// ─── Question count (public, cached module-level) ────────────────────────────

let _questionCountCache: number | null = null
export async function getQuestionCount(): Promise<number> {
  if (_questionCountCache !== null) return _questionCountCache
  const { data, error } = await supabase.rpc('get_question_count')
  if (error) throw error
  _questionCountCache = data as number
  return _questionCountCache
}

// ─── Crowns ───────────────────────────────────────────────────────────────────

export async function getPlayerCrowns(): Promise<{ global: number; friends: number }> {
  const { data, error } = await supabase.rpc('get_player_crowns')
  if (error) throw error
  return data as { global: number; friends: number }
}

// ─── Awards ───────────────────────────────────────────────────────────────────

export async function syncPlayerAwards(): Promise<{
  stats: Record<string, number>
  awards: Array<{ category: string; tier: number; earned_at: string }>
}> {
  const { data, error } = await supabase.rpc('sync_player_awards')
  if (error) throw error
  return data as any
}

// ─── Admin: Submissions ────────────────────────────────────────────────────────

export async function adminGetSubmissions(status?: string) {
  const { data, error } = await supabase.rpc('admin_get_submissions', {
    p_status: status ?? null,
  })
  if (error) throw error
  return data ?? []
}

export async function adminReviewSubmission(id: string, status: string, featuredDate?: string) {
  const updates: Record<string, unknown> = { status }
  if (featuredDate) updates.featured_date = featuredDate
  const { error } = await supabase
    .from('question_submissions')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}
