import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'

interface MiniChatProps {
  tournamentId: string
  tournamentSlug: string
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export async function MiniChat({ tournamentId, tournamentSlug }: MiniChatProps) {
  const supabase = await createClient()

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('id, content, created_at, player:players!chat_messages_player_id_fkey(display_name, nickname)')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: false })
    .limit(8)

  const reversed = messages?.slice().reverse() ?? []

  return (
    <Card className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-lg font-bold text-foreground">Tournament Chat</h3>
        <span className="text-xs text-text-muted">{reversed.length} recent</span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {reversed.length > 0 ? (
          <div className="space-y-2.5">
            {reversed.map((msg) => {
              const player = msg.player as unknown as { display_name: string; nickname: string | null }
              const name = player?.nickname || player?.display_name || 'Unknown'
              return (
                <div key={msg.id} className="flex items-start gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/20 text-xs font-bold text-gold">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-gold">{name}</span>
                      <span className="text-xs text-text-muted">{timeAgo(msg.created_at)}</span>
                    </div>
                    <p className="text-sm leading-snug text-text-secondary line-clamp-2">{msg.content}</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-text-secondary">No messages yet.</p>
            <p className="mt-1 text-xs text-text-muted">Be the first to start the banter!</p>
          </div>
        )}
        {/* Fade overlay at bottom */}
        {reversed.length > 4 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent" />
        )}
      </div>

      <Link
        href={`/tournament/${tournamentSlug}/chat`}
        className="mt-3 block rounded-lg bg-gold/10 px-4 py-2.5 text-center text-sm font-medium text-gold transition-colors hover:bg-gold/20"
      >
        Join the conversation &rarr;
      </Link>
    </Card>
  )
}
