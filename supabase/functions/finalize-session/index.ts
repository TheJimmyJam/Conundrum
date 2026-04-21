import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 100
const MAX_SPEED = 50
const SPEED_WINDOW = 20000
const STREAK_BONUS = 10
const STREAK_THRESHOLD = 3
const MIN_RESPONSE_MS = 300

function calcPoints(isCorrect: boolean, timeMs: number, streak: number): number {
  if (!isCorrect) return 0
  const speed = Math.max(0, Math.round(MAX_SPEED * (1 - timeMs / SPEED_WINDOW)))
  const streakBonus = streak >= STREAK_THRESHOLD ? STREAK_BONUS : 0
  return BASE + speed + streakBonus
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { session_id, answers } = await req.json()
    const authHeader = req.headers.get('Authorization')!
    const { data: { user } } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser()

    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    // Load session
    const { data: session } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!session) return new Response(
      JSON.stringify({ error: 'Session not found or already completed' }),
      { status: 404, headers: CORS }
    )

    // Load correct answers
    const questionIds = answers.map((a: any) => a.question_id)
    const { data: correctAnswers } = await supabase
      .from('question_answers')
      .select('question_id, correct_option_id')
      .in('question_id', questionIds)

    const answerMap = new Map(correctAnswers?.map((a: any) => [a.question_id, a.correct_option_id]))

    // Score each answer
    let totalScore = 0
    let correctCount = 0
    let streak = 0
    let longestStreak = 0
    let totalMs = 0
    const antiFast = answers.some((a: any) => a.response_time_ms < MIN_RESPONSE_MS && a.selected_option_id)

    const questionResults = answers.map((a: any) => {
      const correctOptionId = answerMap.get(a.question_id)
      const isCorrect = a.selected_option_id === correctOptionId
      const points = calcPoints(isCorrect, a.response_time_ms, streak)

      if (isCorrect) { correctCount++; streak++; longestStreak = Math.max(longestStreak, streak) }
      else streak = 0

      totalScore += points
      totalMs += a.response_time_ms

      return { question_id: a.question_id, is_correct: isCorrect, correct_option_id: correctOptionId, points_awarded: points, explanation: null }
    })

    const antiFull = totalMs < answers.length * MIN_RESPONSE_MS

    // Insert responses
    await supabase.from('responses').insert(
      answers.map((a: any, i: number) => ({
        game_session_id: session_id,
        question_id: a.question_id,
        selected_option_id: a.selected_option_id || null,
        response_time_ms: a.response_time_ms,
        is_correct: questionResults[i].is_correct,
        points_awarded: questionResults[i].points_awarded,
      }))
    )

    // Finalize session
    await supabase.from('game_sessions').update({
      status: 'completed',
      score: totalScore,
      correct_count: correctCount,
      question_count: answers.length,
      longest_streak: longestStreak,
      duration_ms: totalMs,
      completed_at: new Date().toISOString(),
      anti_cheat_flag: antiFast || antiFull,
    }).eq('id', session_id)

    return new Response(JSON.stringify({
      score: totalScore,
      correct_count: correctCount,
      duration_ms: totalMs,
      question_results: questionResults,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
