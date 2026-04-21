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

    const { challenge_id } = await req.json()

    // Load challenge — user must be the challenged person
    const { data: challenge } = await sb.from('challenges').select('*')
      .eq('id', challenge_id)
      .eq('challenged_id', user.id)
      .in('status', ['pending', 'awaiting_opponent'])
      .single()
    if (!challenge) return new Response(JSON.stringify({ error: 'Challenge not found' }), { status: 404, headers: CORS })

    // Create challenged session if it doesn't exist yet
    let sessionId = challenge.challenged_session_id
    if (!sessionId) {
      const { data: session } = await sb.from('game_sessions').insert({
        user_id: user.id,
        mode: 'challenge',
        status: 'active',
      }).select().single()
      sessionId = session.id
      await sb.from('challenges').update({ challenged_session_id: sessionId }).eq('id', challenge_id)
    }

    // Load questions from the challenge question set
    const { data: setQs } = await sb
      .from('challenge_question_set_items')
      .select('position, questions(id, prompt, question_type, difficulty, explanation, category_id, question_options(id, option_text, sort_order))')
      .eq('challenge_question_set_id', challenge.cqs_id)
      .order('position')

    const questions = (setQs ?? []).map((row: any) => ({
      ...row.questions,
      options: (row.questions.question_options ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
    }))

    return new Response(JSON.stringify({ session_id: sessionId, questions }), {
      headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
