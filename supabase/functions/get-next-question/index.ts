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

  // Load session
  const { data: session } = await supabase
    .from('game_sessions')
    .select('*')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('mode', 'endless')
    .single()

  if (!session) return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 })

  // Get already-served question IDs for this session
  const { data: served } = await supabase
    .from('responses')
    .select('question_id')
    .eq('game_session_id', session_id)

  const servedIds = (served ?? []).map((r: any) => r.question_id)

  // Build query for next question
  let query = supabase
    .from('questions')
    .select('id, prompt, question_type, difficulty, explanation, category_id, question_options(id, option_text, sort_order)')
    .eq('is_active', true)

  if (servedIds.length > 0) query = query.not('id', 'in', `(${servedIds.join(',')})`)
  if (session.category_id) query = query.eq('category_id', session.category_id)

  // Random selection via limit — Supabase doesn't support ORDER BY random() directly,
  // so we fetch a small batch and pick one
  const { data: candidates } = await query.limit(50)

  if (!candidates || candidates.length === 0) {
    return new Response(JSON.stringify({ done: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  const question = candidates[Math.floor(Math.random() * candidates.length)]

  return new Response(JSON.stringify({ done: false, question }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
