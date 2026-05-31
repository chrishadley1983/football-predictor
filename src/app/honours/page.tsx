import { createClient } from '@/lib/supabase/server'
import { HonoursBoard } from '@/components/HonoursBoard'
import type { HonoursWithDetails } from '@/lib/types'

export const metadata = {
  title: "Honours Board - Freemo's Prediction Game",
}

export default async function HonoursPage() {
  const supabase = await createClient()

  // Use the honours_with_tournament view: it bypasses RLS so archived
  // tournaments (is_visible=false) still resolve here, even though they
  // can't be viewed via /tournament/[slug].
  const { data: honours, error: honoursErr } = await supabase
    .from('honours_with_tournament')
    .select('*')
    .order('sort_order', { ascending: true })

  if (honoursErr) console.error('Failed to fetch honours:', honoursErr.message)

  return (
    <div>
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">Honours Board</h1>
      <HonoursBoard honours={(honours as HonoursWithDetails[]) ?? []} />
    </div>
  )
}
