import { createClient } from '@/lib/supabase/server'
import { HonoursBoard } from '@/components/HonoursBoard'
import type { HonoursWithDetails } from '@/lib/types'

export const metadata = {
  title: 'Honours Board - Football Prediction Game',
}

export default async function HonoursPage() {
  const supabase = await createClient()

  const { data: honours } = await supabase
    .from('honours')
    .select(`
      *,
      tournament:tournaments (*),
      player:players (*)
    `)
    .order('id')

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-gray-100">Honours Board</h1>
      <HonoursBoard honours={(honours as HonoursWithDetails[]) ?? []} />
    </div>
  )
}
