import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE = 100
const MAX_SPEED = 50
const SPEED_WINDOW = 15000
const STREAK_BONUS = 10
const STREAK_THRESHOLD = 3

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

    const { session_id, question_id, selected_option_id, response_time_ms } = await req.json()
    const authHeader = req.headers.get('Authorization')!
    const { data: { user } } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser()

    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const { data: session } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .eq('mode', 'endless')
      .single()

    if (!session) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404, headers: CORS })

    const { data: answerRow } = await supabase
      .from('question_answers')
      .select('correct_option_id')
      .eq('question_id', question_id)
      .single()

    const correctOptionId = answerRow?.correct_option_id
    const isCorrect = selected_option_id === correctOptionId

    const { data: prevResponses } = await supabase
      .from('responses')
      .select('is_correct')
      .eq('game_session_id', session_id)
      .order('answered_at', { ascending: false })
      .limit(10)

    let streak = 0
    for (const r of (prevResponses ?? [])) {
      if (r.is_correct) streak++
      else break
    }

    const points = calcPoints(isCorrect, response_time_ms, streak)

    const { data: question } = await supabase
      .from('questions')
      .select('explanation')
      .eq('id', question_id)
      .single()

    await supabase.from('responses').insert({
      game_session_id: session_id,
      question_id,
      selected_option_id: selected_option_id || null,
      response_time_ms,
      is_correct: isCorrect,
      points_awarded: points,
    })

    await supabase.from('game_sessions').update({
      score: session.score + points,
      correct_count: session.correct_count + (isCorrect ? 1 : 0),
      question_count: session.question_count + 1,
      longest_streak: Math.max(session.longest_streak, isCorrect ? streak + 1 : 0),
    }).eq('id', session_id)

    return new Response(JSON.stringify({
      is_correct: isCorrect,
      correct_option_id: correctOptionId,
      points_awarded: points,
      explanation: question?.explanation ?? null,
      running_score: session.score + points,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
