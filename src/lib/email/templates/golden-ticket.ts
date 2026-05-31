import type { GoldenTicketEvent } from '../audit'
import { escapeHtml, renderDetailTable, renderPlayerLine, wrapInBrandedLayout } from './shared'

export function renderGoldenTicket(
  e: GoldenTicketEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, swap } = e

  const subject = `[Freemo's] Emergency Sub used: ${player.displayName} (${tournament.name})`

  const text = [
    `Emergency Sub used`,
    ``,
    `Player:     ${renderPlayerLine(player)}`,
    `Tournament: ${tournament.name} (${tournament.slug})`,
    `Round:      ${swap.round}`,
    `Match:      ${swap.matchLabel}`,
    `Swap:       ${swap.oldTeam ?? '—'} → ${swap.newTeam}`,
  ].join('\n')

  const html = wrapInBrandedLayout({
    heading: 'Emergency Sub Used',
    badgeText: 'EMERGENCY SUB',
    badgeColor: '#dc2626',
    player,
    tournament,
    body: renderDetailTable([
      { label: 'Round', value: escapeHtml(swap.round) },
      { label: 'Match', value: `<strong>${escapeHtml(swap.matchLabel)}</strong>` },
      {
        label: 'Team swap',
        value: `<span style="color: #999; text-decoration: line-through;">${escapeHtml(swap.oldTeam ?? '—')}</span> &rarr; <strong style="color: #059669;">${escapeHtml(swap.newTeam)}</strong>`,
      },
      { label: 'Penalty', value: '<strong style="color: #dc2626;">-6 points</strong>' },
    ]),
  })

  return { subject, html, text }
}
