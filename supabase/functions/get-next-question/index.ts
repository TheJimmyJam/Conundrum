import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
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

    // Get ALL session IDs ever played by this user
    const { data: userSessions } = await supabase
      .from('game_sessions')
      .select('id')
      .eq('user_id', user.id)

    const userSessionIds = (userSessions ?? []).map((s: any) => s.id)

    // Get every question this user has ever answered across all sessions
    let seenIds: string[] = []
    if (userSessionIds.length > 0) {
      const { data: answered } = await supabase
        .from('responses')
        .select('question_id')
        .in('game_session_id', userSessionIds)

      seenIds = [...new Set((answered ?? []).map((r: any) => r.question_id))]
    }

    let query = supabase
      .from('questions')
      .select('id, prompt, question_type, difficulty, explanation, category_id, question_options(id, option_text, sort_order)')
      .eq('is_active', true)

    if (seenIds.length > 0) query = query.not('id', 'in', `(${seenIds.join(',')})`)
    if (session.category_id) query = query.eq('category_id', session.category_id)

    const { data: candidates } = await query.limit(50)

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ done: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const raw = candidates[Math.floor(Math.random() * candidates.length)]
    const question = { ...raw, options: raw.question_options ?? [] }

    return new Response(JSON.stringify({ done: false, question }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
