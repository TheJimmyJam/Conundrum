import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { challenged_id } = await req.json()

    // Verify friendship
    const { data: friendship } = await sb.from('friendships').select('id')
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${challenged_id}),and(requester_id.eq.${challenged_id},addressee_id.eq.${user.id})`)
      .eq('status', 'accepted').single()
    if (!friendship) return new Response(JSON.stringify({ error: 'Not friends' }), { status: 403, headers: CORS })

    // Check no active challenge already exists between these two today
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await sb.from('challenges').select('id')
      .eq('challenger_id', user.id).eq('challenged_id', challenged_id)
      .gte('created_at', today).in('status', ['pending', 'awaiting_opponent'])
      .maybeSingle()
    if (existing) return new Response(JSON.stringify({ error: 'Challenge already pending' }), { status: 409, headers: CORS })

    // Pick 10 random questions
    const { data: pool } = await sb.from('questions')
      .select('id, prompt, question_type, difficulty, explanation, category_id, question_options(id, option_text, sort_order)')
      .eq('is_active', true)
      .limit(200)
    if (!pool || pool.length < 10) return new Response(JSON.stringify({ error: 'Not enough questions' }), { status: 500, headers: CORS })

    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 10)

    // Create a dedicated challenge question set (no daily_sets collision)
    const { data: qSet, error: qSetErr } = await sb
      .from('challenge_question_sets')
      .insert({})
      .select()
      .single()
    if (qSetErr || !qSet) return new Response(JSON.stringify({ error: 'Failed to create question set' }), { status: 500, headers: CORS })

    for (let i = 0; i < shuffled.length; i++) {
      await sb.from('challenge_question_set_items').insert({
        challenge_question_set_id: qSet.id,
        question_id: shuffled[i].id,
        position: i + 1,
      })
    }

    // Create challenger's game session
    const { data: session, error: sessionErr } = await sb.from('game_sessions').insert({
      user_id: user.id,
      mode: 'challenge',
      status: 'active',
    }).select().single()
    if (sessionErr || !session) return new Response(JSON.stringify({ error: 'Failed to create session' }), { status: 500, headers: CORS })

    // Create challenge record
    const { data: challenge, error: challengeErr } = await sb.from('challenges').insert({
      challenger_id: user.id,
      challenged_id,
      cqs_id: qSet.id,
      challenger_session_id: session.id,
      status: 'pending',
    }).select().single()
    if (challengeErr || !challenge) return new Response(JSON.stringify({ error: 'Failed to create challenge' }), { status: 500, headers: CORS })

    const questions = shuffled.map((q: any) => ({
      ...q,
      options: (q.question_options ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }))

    return new Response(JSON.stringify({ challenge_id: challenge.id, session_id: session.id, questions }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
