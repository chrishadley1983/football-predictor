import type { ProfileUpdatedEvent } from '../audit'
import { escapeHtml, renderPlayerHtml, renderPlayerLine } from './shared'

export function renderProfileUpdated(
  e: ProfileUpdatedEvent
): { subject: string; html: string; text: string } {
  const { player, changes } = e

  const fieldNames = changes.map((c) => c.field).join(', ')
  const subject = `[FPG audit] Profile: ${player.displayName} — ${fieldNames}`

  const text = [
    `Profile updated`,
    ``,
    `Player:  ${renderPlayerLine(player)}`,
    ``,
    ...changes.map((c) => `  ${c.field}: ${c.old ?? '—'} → ${c.new ?? '—'}`),
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; color: #111;">
      <h2 style="margin: 0 0 12px;">Profile updated</h2>
      <p style="margin: 0 0 12px; font-size: 14px;">${renderPlayerHtml(player)}</p>
      <table style="border-collapse: collapse; font-size: 14px;">
        ${changes
          .map(
            (c) => `
              <tr>
                <td style="padding: 4px 12px 4px 0; color: #666;">${escapeHtml(c.field)}</td>
                <td style="padding: 4px 0;">
                  <span style="color: #999; text-decoration: line-through;">${escapeHtml(c.old ?? '—')}</span>
                  → <strong>${escapeHtml(c.new ?? '—')}</strong>
                </td>
              </tr>`
          )
          .join('')}
      </table>
    </div>
  `.trim()

  return { subject, html, text }
}
