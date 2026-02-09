import { createClient } from '@/lib/supabase/server'
import { HonoursBoard } from '@/components/HonoursBoard'
import type { HonoursWithDetails } from '@/lib/types'

export const metadata = {
  title: 'Honours Board - Football Prediction Game',
}

export default async function HonoursPage() {
  const supabase = await createClient()

  const { data: honours, error: honoursErr } = await supabase
    .from('honours')
    .select(`
      *,
      tournament:tournaments (*),
      player:players (id, display_name, nickname, avatar_url)
    `)
    .order('sort_order', { ascending: true })

  if (honoursErr) console.error('Failed to fetch honours:', honoursErr.message)

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">Honours Board</h1>
      <HonoursBoard honours={(honours as HonoursWithDetails[]) ?? []} />
    </div>
  )
}
