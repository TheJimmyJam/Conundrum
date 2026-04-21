import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { session_id } = await req.json()
  const authHeader = req.headers.get('Authorization')!
  const { data: { user } } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  ).auth.getUser()

  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { data: session } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .in('status', ['active'])
    .single()

  if (!session) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 })

  const completedAt = new Date().toISOString()
  const durationMs = new Date(completedAt).getTime() - new Date(session.started_at).getTime()

  // Finalize
  await supabase.from('game_sessions').update({
    status: 'completed',
    completed_at: completedAt,
    duration_ms: durationMs,
  }).eq('id', session_id)

  // Check personal best
  const { data: prevBest } = await supabase
    .from('game_sessions')
    .select('score')
    .eq('user_id', user.id)
    .eq('mode', 'endless')
    .eq('category_id', session.category_id)
    .eq('status', 'completed')
    .neq('id', session_id)
    .order('score', { ascending: false })
    .limit(1)
    .single()

  const isNewPersonalBest = !prevBest || session.score > prevBest.score

  return new Response(JSON.stringify({
    score: session.score,
    correct_count: session.correct_count,
    question_count: session.question_count,
    longest_streak: session.longest_streak,
    duration_ms: durationMs,
    is_new_personal_best: isNewPersonalBest,
  }), { headers: { 'Content-Type': 'application/json' } })
})
