import type { GoldenTicketEvent } from '../audit'
import { escapeHtml, renderPlayerHtml, renderPlayerLine } from './shared'

export function renderGoldenTicket(
  e: GoldenTicketEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, swap } = e

  const subject = `[FPG audit] Golden ticket played: ${player.displayName} (${tournament.name})`

  const text = [
    `Golden ticket played`,
    ``,
    `Player:     ${renderPlayerLine(player)}`,
    `Tournament: ${tournament.name} (${tournament.slug})`,
    `Round:      ${swap.round}`,
    `Match:      ${swap.matchLabel}`,
    `Swap:       ${swap.oldTeam ?? '—'} → ${swap.newTeam}`,
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; color: #111;">
      <h2 style="margin: 0 0 12px;">🎟️ Golden ticket played</h2>
      <table style="border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Player</td><td style="padding: 4px 0;">${renderPlayerHtml(player)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Tournament</td><td style="padding: 4px 0;"><strong>${escapeHtml(tournament.name)}</strong> (${escapeHtml(tournament.slug)})</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Round</td><td style="padding: 4px 0;">${escapeHtml(swap.round)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Match</td><td style="padding: 4px 0;">${escapeHtml(swap.matchLabel)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Swap</td><td style="padding: 4px 0;"><span style="color: #999; text-decoration: line-through;">${escapeHtml(swap.oldTeam ?? '—')}</span> → <strong>${escapeHtml(swap.newTeam)}</strong></td></tr>
      </table>
    </div>
  `.trim()

  return { subject, html, text }
}
