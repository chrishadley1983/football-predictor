import type { KnockoutPredictionsEvent } from '../audit'
import { escapeHtml, renderPlayerLine, wrapInBrandedLayout } from './shared'

export function renderKnockoutPredictions(
  e: KnockoutPredictionsEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, changes } = e
  const changedCount = changes.filter((c) => c.changed).length

  const subject = `[Freemo's] Knockout predictions: ${player.displayName} — ${changedCount} match${changedCount === 1 ? '' : 'es'} changed`

  const text = [
    `Knockout predictions submitted`,
    ``,
    `Player:     ${renderPlayerLine(player)}`,
    `Tournament: ${tournament.name} (${tournament.slug})`,
    ``,
    ...changes.map((c) =>
      c.changed
        ? `${c.matchLabel}: ${c.old ?? '—'} → ${c.new}`
        : `${c.matchLabel}: ${c.new} (unchanged)`
    ),
  ].join('\n')

  const tableRows = changes
    .map((c) => {
      const bg = c.changed ? '#fef3c7' : '#fff'
      const statusIcon = c.changed
        ? '<span style="color: #d97706; font-size: 10px;">&#9679;</span> '
        : ''
      const winner = c.changed
        ? `<span style="color: #999; text-decoration: line-through; font-size: 11px;">${escapeHtml(c.old ?? '—')}</span> <strong>${escapeHtml(c.new)}</strong>`
        : escapeHtml(c.new)
      return `<tr style="background: ${bg};">
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${statusIcon}<strong>${escapeHtml(c.matchLabel)}</strong></td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${winner}</td>
      </tr>`
    })
    .join('')

  const html = wrapInBrandedLayout({
    heading: 'Knockout Predictions Submitted',
    badgeText: `${changedCount} CHANGED`,
    badgeColor: '#d97706',
    player,
    tournament,
    body: `
      <table style="border-collapse: collapse; font-size: 13px; width: 100%; background: #fff; border-radius: 6px; overflow: hidden; border: 1px solid #e0e0e0;">
        <thead>
          <tr style="background: #1a5c3a; color: #fff;">
            <th style="text-align: left; padding: 8px 10px;">Match</th>
            <th style="text-align: left; padding: 8px 10px;">Predicted Winner</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    `,
  })

  return { subject, html, text }
}
