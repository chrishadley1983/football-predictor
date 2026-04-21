import type { TournamentEntryEvent } from '../audit'
import { escapeHtml, renderPlayerHtml, renderPlayerLine } from './shared'

export function renderTournamentEntry(
  e: TournamentEntryEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, entryId, entryFeeGbp } = e
  const fee = entryFeeGbp != null ? `£${entryFeeGbp.toFixed(2)}` : '—'

  const subject = `[FPG audit] Entry: ${player.displayName} → ${tournament.name}`

  const text = [
    `New tournament entry`,
    ``,
    `Player:     ${renderPlayerLine(player)}`,
    `Tournament: ${tournament.name} (${tournament.slug}, ${tournament.year})`,
    `Entry ID:   ${entryId}`,
    `Entry fee:  ${fee}`,
    `Status:     pending`,
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; color: #111;">
      <h2 style="margin: 0 0 12px;">New tournament entry</h2>
      <table style="border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Player</td><td style="padding: 4px 0;">${renderPlayerHtml(player)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Tournament</td><td style="padding: 4px 0;"><strong>${escapeHtml(tournament.name)}</strong> (${escapeHtml(tournament.slug)}, ${tournament.year})</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Entry ID</td><td style="padding: 4px 0; font-family: monospace; font-size: 12px;">${escapeHtml(entryId)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Entry fee</td><td style="padding: 4px 0;">${escapeHtml(fee)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Status</td><td style="padding: 4px 0;">pending</td></tr>
      </table>
    </div>
  `.trim()

  return { subject, html, text }
}
