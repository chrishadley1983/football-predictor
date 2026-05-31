import type { TournamentEntryEvent } from '../audit'
import { escapeHtml, renderDetailTable, renderPlayerLine, wrapInBrandedLayout } from './shared'

export function renderTournamentEntry(
  e: TournamentEntryEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, entryId, entryFeeGbp } = e
  const fee = entryFeeGbp != null ? `£${entryFeeGbp.toFixed(2)}` : '—'

  const subject = `[Freemo's] Entry: ${player.displayName} → ${tournament.name}`

  const text = [
    `New tournament entry`,
    ``,
    `Player:     ${renderPlayerLine(player)}`,
    `Tournament: ${tournament.name} (${tournament.slug}, ${tournament.year})`,
    `Entry ID:   ${entryId}`,
    `Entry fee:  ${fee}`,
    `Status:     pending`,
  ].join('\n')

  const html = wrapInBrandedLayout({
    heading: 'New Tournament Entry',
    badgeText: 'ENTRY',
    badgeColor: '#059669',
    player,
    tournament,
    body: renderDetailTable([
      { label: 'Entry ID', value: escapeHtml(entryId), mono: true },
      { label: 'Entry fee', value: escapeHtml(fee) },
      { label: 'Status', value: '<span style="color: #d97706; font-weight: 600;">Pending</span>' },
    ]),
  })

  return { subject, html, text }
}
