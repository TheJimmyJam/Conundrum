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

    // Verify friendship exists and is accepted
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

    // Get today's main daily set questions (to exclude)
    const { data: mainSet } = await sb.from('daily_sets').select('id')
      .eq('set_date', today).eq('is_published', true).maybeSingle()

    let excludeIds: string[] = []
    if (mainSet) {
      const { data: mainQs } = await sb.from('daily_set_questions').select('question_id').eq('daily_set_id', mainSet.id)
      excludeIds = (mainQs ?? []).map((r: any) => r.question_id)
    }

    // Pick 10 random questions not in today's main daily
    let query = sb.from('questions').select('id, prompt, question_type, difficulty, explanation, category_id, question_options(id, option_text, sort_order)').eq('is_active', true)
    if (excludeIds.length > 0) query = query.not('id', 'in', `(${excludeIds.join(',')})`)
    const { data: pool } = await query.limit(100)
    if (!pool || pool.length < 10) return new Response(JSON.stringify({ error: 'Not enough questions' }), { status: 500, headers: CORS })

    // Shuffle and pick 10
    const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 10)

    // Create question set for this challenge
    const { data: qSet } = await sb.from('daily_sets').insert({
      set_date: today,
      title: `Challenge`,
      is_published: true,
    }).select().single()

    for (let i = 0; i < shuffled.length; i++) {
      await sb.from('daily_set_questions').insert({ daily_set_id: qSet.id, question_id: shuffled[i].id, position: i + 1 })
    }

    // Create challenger's game session
    const { data: session } = await sb.from('game_sessions').insert({
      user_id: user.id,
      daily_set_id: qSet.id,
      mode: 'challenge',
      status: 'active',
    }).select().single()

    // Create challenge record
    const { data: challenge } = await sb.from('challenges').insert({
      challenger_id: user.id,
      challenged_id,
      question_set_id: qSet.id,
      challenger_session_id: session.id,
      status: 'pending',
    }).select().single()

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
