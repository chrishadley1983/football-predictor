import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PUNDITS } from '@/lib/pundit-characters'
import type { PunditKey } from '@/lib/types'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = await createClient()

  // Get tournament ID from slug
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tournament) {
    return NextResponse.json({ pundit_key: null, content: null }, { status: 200 })
  }

  // Get today's date in UTC
  const today = new Date().toISOString().split('T')[0]

  // Try today's snippets first, then fall back to most recent date
  let { data: snippet } = await supabase
    .from('pundit_snippets')
    .select('*')
    .eq('tournament_id', tournament.id)
    .eq('generated_date', today)
    .limit(1)

  // If no snippets for today, get the most recent date
  if (!snippet || snippet.length === 0) {
    const { data: latest } = await supabase
      .from('pundit_snippets')
      .select('*')
      .eq('tournament_id', tournament.id)
      .order('generated_date', { ascending: false })
      .limit(50)

    if (latest && latest.length > 0) {
      // Pick a random one from the most recent batch
      const randomIdx = Math.floor(Math.random() * latest.length)
      snippet = [latest[randomIdx]]
    }
  } else {
    // Pick a random snippet from today's batch
    const { data: allToday } = await supabase
      .from('pundit_snippets')
      .select('*')
      .eq('tournament_id', tournament.id)
      .eq('generated_date', today)

    if (allToday && allToday.length > 0) {
      const randomIdx = Math.floor(Math.random() * allToday.length)
      snippet = [allToday[randomIdx]]
    }
  }

  if (!snippet || snippet.length === 0) {
    return NextResponse.json({ pundit_key: null, content: null }, { status: 200 })
  }

  const s = snippet[0]
  const punditKey = s.pundit_key as PunditKey
  const pundit = PUNDITS[punditKey]

  return NextResponse.json({
    pundit_key: punditKey,
    name: pundit.name,
    content: s.content,
    category: s.category,
    color: pundit.color,
  })
}
