import type { KnockoutPredictionsEvent } from '../audit'
import { escapeHtml, renderPlayerHtml, renderPlayerLine } from './shared'

export function renderKnockoutPredictions(
  e: KnockoutPredictionsEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, changes } = e
  const changedCount = changes.filter((c) => c.changed).length

  const subject = `[FPG audit] Knockout predictions: ${player.displayName} — ${changedCount} match${changedCount === 1 ? '' : 'es'} changed`

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

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; color: #111;">
      <h2 style="margin: 0 0 12px;">Knockout predictions submitted</h2>
      <p style="margin: 0 0 12px; font-size: 14px;">
        <span style="color: #666;">Player:</span> ${renderPlayerHtml(player)}<br>
        <span style="color: #666;">Tournament:</span> <strong>${escapeHtml(tournament.name)}</strong> (${escapeHtml(tournament.slug)})
      </p>
      <table style="border-collapse: collapse; font-size: 13px; width: 100%;">
        <thead>
          <tr style="background: #f4f4f4;">
            <th style="text-align: left; padding: 6px 10px; border: 1px solid #ddd;">Match</th>
            <th style="text-align: left; padding: 6px 10px; border: 1px solid #ddd;">Predicted winner</th>
          </tr>
        </thead>
        <tbody>
          ${changes
            .map((c) => {
              const bg = c.changed ? '#fff8dc' : '#fff'
              const winner = c.changed
                ? `<span style="color: #999; text-decoration: line-through;">${escapeHtml(c.old ?? '—')}</span> → <strong>${escapeHtml(c.new)}</strong>`
                : escapeHtml(c.new)
              return `<tr><td style="padding: 6px 10px; border: 1px solid #ddd; background: ${bg};"><strong>${escapeHtml(c.matchLabel)}</strong>${c.changed ? '' : ' <span style="color:#999;">(unchanged)</span>'}</td><td style="padding: 6px 10px; border: 1px solid #ddd; background: ${bg};">${winner}</td></tr>`
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `.trim()

  return { subject, html, text }
}
