import { supabase } from './supabase'
import { tierFromRate } from './questionTier'
import { getActiveDailyDate } from './dailyTime'
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
  // Uses Eastern Time with 6:00 AM reset — before 6 AM ET shows previous day's set
  const activeDate = getActiveDailyDate()
  const { data, error } = await supabase
    .from('daily_sets')
    .select('*')
    .eq('set_date', activeDate)
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
        question_options ( id, option_text, sort_order ),
        question_stats ( total_answers, correct_answers )
      )
    `)
    .eq('daily_set_id', dailySetId)
    .order('position')
  if (error) throw error
  return (data ?? []).map((row: any) => {
    const stats = row.questions.question_stats
    const rate = stats && stats.total_answers > 0
      ? stats.correct_answers / stats.total_answers
      : null
    return {
      ...row.questions,
      options: row.questions.question_options ?? [],
      total_answers: stats?.total_answers ?? 0,
      correct_answers: stats?.correct_answers ?? 0,
      difficulty_tier: rate !== null ? tierFromRate(rate) : null,
    }
  })
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
  // Single DB round-trip RPC — much faster than the edge function approach
  const { data, error } = await supabase.rpc('get_endless_question', {
    p_session_id: sessionId,
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  // Normalize options: RPC returns 'options', frontend expects 'options'
  if (data?.question?.options) {
    data.question.options = data.question.options
  }
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  const { data, error } = await supabase.from('friendships').insert({
    requester_id: user.id,
    addressee_id: addresseeId,
  }).select().single()
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
  category_id: string | null
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

// ─── Community Question Answers ───────────────────────────────────────────────

export async function recordCommunityAnswer(submissionId: string, isCorrect: boolean) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('community_question_answers').insert({
    user_id: user.id,
    submission_id: submissionId,
    is_correct: isCorrect,
  })
  // ignore duplicate errors (already answered today)
}

export async function getMyTodayCommunityAnswer(
  submissionId: string
): Promise<{ is_correct: boolean } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('community_question_answers')
    .select('is_correct')
    .eq('user_id', user.id)
    .eq('submission_id', submissionId)
    .maybeSingle()
  return data ?? null
}

export async function getCommunityCorrectCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_community_correct_count')
  if (error) return 0
  return Number(data ?? 0)
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

// ─── Admin: Daily Management ──────────────────────────────────────────────────

export async function adminClearFeaturedSubmission(id: string) {
  const { error } = await supabase
    .from('question_submissions')
    .update({ status: 'approved', featured_date: null })
    .eq('id', id)
  if (error) throw error
}

export type QueuedSubmission = {
  id: string
  username: string
  prompt: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: string
  explanation: string | null
  status: string
  featured_date: string | null
  created_at: string
}

export async function adminGetSubmissionQueue(): Promise<QueuedSubmission[]> {
  const { data, error } = await supabase.rpc('admin_get_submission_queue')
  if (error) throw error
  return data ?? []
}

export async function adminUpdateSubmission(
  id: string,
  updates: {
    prompt: string
    option_a: string
    option_b: string
    option_c: string
    option_d: string
    correct_option: string
    explanation: string | null
  }
) {
  const { error } = await supabase.rpc('admin_update_submission', {
    p_id:            id,
    p_prompt:        updates.prompt,
    p_option_a:      updates.option_a,
    p_option_b:      updates.option_b,
    p_option_c:      updates.option_c,
    p_option_d:      updates.option_d,
    p_correct_option: updates.correct_option,
    p_explanation:   updates.explanation ?? '',
  })
  if (error) throw error
}

export async function adminDeleteSubmission(id: string) {
  const { error } = await supabase.rpc('admin_delete_submission', { p_id: id })
  if (error) throw error
}

export async function adminFeatureSubmissionNow(id: string) {
  const { error } = await supabase.rpc('admin_feature_submission_now', { p_id: id })
  if (error) throw error
}

export async function adminGetDailyPlayers(date?: string): Promise<{
  session_id: string
  user_id: string
  username: string
  display_name: string | null
  score: number
  correct_count: number
  completed_at: string
  anti_cheat_flag: boolean
}[]> {
  const { data, error } = await supabase.rpc('admin_get_daily_players', {
    p_date: date ?? new Date().toISOString().split('T')[0],
  })
  if (error) throw error
  return data ?? []
}

export async function adminResetDailySession(sessionId: string) {
  const { error } = await supabase.rpc('admin_reset_daily_session', {
    p_session_id: sessionId,
  })
  if (error) throw error
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
  const { error } = await supabase.rpc('admin_review_submission', {
    p_id: id,
    p_status: status,
    p_featured_date: featuredDate ?? null,
  })
  if (error) throw error
}

// ─── Admin: Players ───────────────────────────────────────────────────────────

export type AdminPlayer = {
  id: string
  username: string
  display_name: string | null
  email: string
  role: string
  status: 'active' | 'banned' | 'frozen'
  created_at: string
  games_played: number
  best_score: number | null
  is_demo: boolean
}

export async function adminSearchPlayers(query = '', limit = 200, offset = 0): Promise<AdminPlayer[]> {
  const { data, error } = await supabase.rpc('admin_search_players', {
    p_query: query,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    ...r,
    games_played: Number(r.games_played ?? 0),
    best_score: r.best_score != null ? Number(r.best_score) : null,
    is_demo: r.is_demo ?? false,
  }))
}

export async function adminSetPlayerStatus(userId: string, status: 'active' | 'banned' | 'frozen') {
  const { error } = await supabase.rpc('admin_set_player_status', {
    p_user_id: userId,
    p_status: status,
  })
  if (error) throw error
}

export async function adminUpdatePlayerProfile(userId: string, displayName: string, username: string) {
  const { error } = await supabase.rpc('admin_update_player_profile', {
    p_user_id: userId,
    p_display_name: displayName,
    p_username: username,
  })
  if (error) throw error
}

export async function adminResetPlayerDaily(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_reset_player_daily', { p_user_id: userId })
  if (error) throw error
  return Number(data ?? 0)
}

export async function adminResetPlayerLifetime(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_reset_player_lifetime', { p_user_id: userId })
  if (error) throw error
  return Number(data ?? 0)
}

// ─── Admin: Daily Sets ────────────────────────────────────────────────────────

export type AdminDailySet = {
  id: string
  set_date: string
  title: string | null
  is_published: boolean
  created_at: string
  question_count: number
}

export type AdminSetQuestion = {
  dsq_id: string
  slot: number
  question_id: string
  prompt: string
  difficulty: string
  category: string
  is_active: boolean
}

export async function adminGetDailySets(): Promise<AdminDailySet[]> {
  const { data, error } = await supabase.rpc('admin_get_daily_sets')
  if (error) throw error
  return (data ?? []).map((r: any) => ({ ...r, question_count: Number(r.question_count ?? 0) }))
}

export async function adminCreateDailySet(date: string, title?: string): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_daily_set', {
    p_date: date,
    p_title: title ?? null,
  })
  if (error) throw error
  return data as string
}

export async function adminUpdateDailySet(id: string, title: string | null, isPublished: boolean) {
  const { error } = await supabase.rpc('admin_update_daily_set', {
    p_id: id,
    p_title: title ?? '',
    p_is_published: isPublished,
  })
  if (error) throw error
}

export async function adminGetSetQuestions(setId: string): Promise<AdminSetQuestion[]> {
  const { data, error } = await supabase.rpc('admin_get_set_questions', { p_set_id: setId })
  if (error) throw error
  return (data ?? []).map((r: any) => ({ ...r, slot: Number(r.slot) }))
}

export async function adminAddQuestionToSet(setId: string, questionId: string, slot: number) {
  const { error } = await supabase.rpc('admin_add_question_to_set', {
    p_set_id: setId,
    p_question_id: questionId,
    p_position: slot,
  })
  if (error) throw error
}

export async function adminRemoveQuestionFromSet(dsqId: string) {
  const { error } = await supabase.rpc('admin_remove_question_from_set', { p_dsq_id: dsqId })
  if (error) throw error
}

export async function adminSortSetByDifficulty(setId: string) {
  const { error } = await supabase.rpc('admin_sort_set_by_difficulty', { p_set_id: setId })
  if (error) throw error
}

export type DailyQuestionUsage = {
  question_id: string
  times_used: number
  most_recent_date: string | null
  upcoming_date: string | null  // non-null means it's scheduled in a future set
}

export async function adminGetDailyQuestionUsage(): Promise<DailyQuestionUsage[]> {
  const { data, error } = await supabase.rpc('admin_get_daily_question_usage')
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    question_id:      r.question_id,
    times_used:       Number(r.times_used),
    most_recent_date: r.most_recent_date ?? null,
    upcoming_date:    r.upcoming_date ?? null,
  }))
}

// ─── Admin: Demo Data ─────────────────────────────────────────────────────────

export async function adminGenerateDemoUsers(count: number): Promise<{ generated: number; daily_set_date: string; message: string }> {
  const { data, error } = await supabase.rpc('admin_generate_demo_users', { p_count: count })
  if (error) throw error
  const row = (data ?? [])[0]
  return { generated: Number(row?.generated ?? 0), daily_set_date: row?.daily_set_date ?? '', message: row?.message ?? '' }
}

export async function adminRemoveDemoUsers(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_remove_demo_users')
  if (error) throw error
  return Number(data ?? 0)
}

export async function adminCountDemoUsers(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_count_demo_users')
  if (error) throw error
  return Number(data ?? 0)
}

export async function adminScheduleQuestionAsCommunity(questionId: string, date: string) {
  const { error } = await supabase.rpc('admin_schedule_question_as_community', {
    p_question_id: questionId,
    p_date: date,
  })
  if (error) throw error
}

export async function adminAutoPopulateDailySets(daysAhead = 7): Promise<{
  created_count: number
  skipped_count: number
  dates_created: string[]
}> {
  const { data, error } = await supabase.rpc('admin_auto_populate_daily_sets', {
    p_days_ahead: daysAhead,
  })
  if (error) throw error
  const row = (data ?? [])[0]
  return {
    created_count: Number(row?.created_count ?? 0),
    skipped_count: Number(row?.skipped_count ?? 0),
    dates_created: row?.dates_created ?? [],
  }
}

export async function adminReorderSetQuestions(setId: string, orderedDsqIds: string[]) {
  const { error } = await supabase.rpc('admin_reorder_set_questions', {
    p_set_id: setId,
    p_ordered_ids: orderedDsqIds,
  })
  if (error) throw error
}

// ─── Admin: Question Rankings ─────────────────────────────────────────────────

export type RankedQuestion = {
  question_id: string
  prompt: string
  category: string
  total_answers: number
  correct_answers: number
  correct_rate: number
  tier: number
  tier_name: string
  total_ranked: number
}

export async function adminGetQuestionRankings(opts: {
  limit?: number
  offset?: number
  tier?: number | null
  category_id?: string | null
}): Promise<RankedQuestion[]> {
  const { data, error } = await supabase.rpc('admin_get_question_rankings', {
    p_limit:       opts.limit       ?? 100,
    p_offset:      opts.offset      ?? 0,
    p_tier:        opts.tier        ?? null,
    p_category_id: opts.category_id ?? null,
  })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    ...r,
    total_answers:   Number(r.total_answers),
    correct_answers: Number(r.correct_answers),
    correct_rate:    Number(r.correct_rate),
    tier:            Number(r.tier),
    total_ranked:    Number(r.total_ranked),
  }))
}
