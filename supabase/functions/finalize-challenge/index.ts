import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 100, MAX_SPEED = 50, SPEED_WINDOW = 20000, STREAK_BONUS = 10, STREAK_THRESHOLD = 3, MIN_MS = 300

function calcPoints(isCorrect: boolean, timeMs: number, streak: number) {
  if (!isCorrect) return 0
  const speed = Math.max(0, Math.round(MAX_SPEED * (1 - timeMs / SPEED_WINDOW)))
  return BASE + speed + (streak >= STREAK_THRESHOLD ? STREAK_BONUS : 0)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authHeader = req.headers.get('Authorization')!
    const { data: { user } } = await createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { challenge_id, session_id, answers } = await req.json()

    // Validate session
    const { data: session } = await sb.from('game_sessions').select('*')
      .eq('id', session_id).eq('user_id', user.id).eq('status', 'active').single()
    if (!session) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: CORS })

    // Load correct answers
    const questionIds = answers.map((a: any) => a.question_id)
    const { data: correctAnswers } = await sb.from('question_answers').select('question_id, correct_option_id').in('question_id', questionIds)
    const answerMap = new Map(correctAnswers?.map((a: any) => [a.question_id, a.correct_option_id]))

    // Score
    let totalScore = 0, correctCount = 0, streak = 0, longestStreak = 0, totalMs = 0
    const antiFast = answers.some((a: any) => a.response_time_ms < MIN_MS && a.selected_option_id)
    const results = answers.map((a: any) => {
      const correctOptionId = answerMap.get(a.question_id)
      const isCorrect = a.selected_option_id === correctOptionId
      const points = calcPoints(isCorrect, a.response_time_ms, streak)
      if (isCorrect) { correctCount++; streak++; longestStreak = Math.max(longestStreak, streak) } else streak = 0
      totalScore += points; totalMs += a.response_time_ms
      return { question_id: a.question_id, is_correct: isCorrect, correct_option_id: correctOptionId, points_awarded: points }
    })

    await sb.from('responses').insert(answers.map((a: any, i: number) => ({
      game_session_id: session_id, question_id: a.question_id,
      selected_option_id: a.selected_option_id || null,
      response_time_ms: a.response_time_ms,
      is_correct: results[i].is_correct, points_awarded: results[i].points_awarded,
    })))

    await sb.from('game_sessions').update({
      status: 'completed', score: totalScore, correct_count: correctCount,
      question_count: answers.length, longest_streak: longestStreak,
      duration_ms: totalMs, completed_at: new Date().toISOString(),
      anti_cheat_flag: antiFast || totalMs < answers.length * MIN_MS,
    }).eq('id', session_id)

    // Load challenge and check if both players done
    const { data: challenge } = await sb.from('challenges').select('*').eq('id', challenge_id).single()
    if (!challenge) return new Response(JSON.stringify({ error: 'Challenge not found' }), { status: 404, headers: CORS })

    const isChallenger = user.id === challenge.challenger_id
    const otherSessionId = isChallenger ? challenge.challenged_session_id : challenge.challenger_session_id

    let winner_id = null
    let bothDone = false
    let opponentResult = null

    if (otherSessionId) {
      const { data: otherSession } = await sb.from('game_sessions').select('*').eq('id', otherSessionId).single()
      if (otherSession?.status === 'completed') {
        bothDone = true
        opponentResult = { score: otherSession.score, correct_count: otherSession.correct_count, duration_ms: otherSession.duration_ms }

        // Determine winner: most correct, fastest breaks tie
        const myCorrect = correctCount, opCorrect = otherSession.correct_count
        const myMs = totalMs, opMs = otherSession.duration_ms
        if (myCorrect > opCorrect) winner_id = user.id
        else if (opCorrect > myCorrect) winner_id = isChallenger ? challenge.challenged_id : challenge.challenger_id
        else if (myMs < opMs) winner_id = user.id
        else if (opMs < myMs) winner_id = isChallenger ? challenge.challenged_id : challenge.challenger_id
        // else tie — winner_id stays null

        await sb.from('challenges').update({ status: 'completed', winner_id }).eq('id', challenge_id)
      }
    }

    if (!bothDone) {
      await sb.from('challenges').update({ status: 'awaiting_opponent' }).eq('id', challenge_id)
    }

    return new Response(JSON.stringify({
      score: totalScore, correct_count: correctCount, duration_ms: totalMs,
      question_results: results, both_done: bothDone, winner_id, opponent_result: opponentResult,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
