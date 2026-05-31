import type { ProfileUpdatedEvent } from '../audit'
import { escapeHtml, renderPlayerLine, wrapInBrandedLayout } from './shared'

export function renderProfileUpdated(
  e: ProfileUpdatedEvent
): { subject: string; html: string; text: string } {
  const { player, changes } = e

  const fieldNames = changes.map((c) => c.field).join(', ')
  const subject = `[Freemo's] Profile: ${player.displayName} — ${fieldNames}`

  const text = [
    `Profile updated`,
    ``,
    `Player:  ${renderPlayerLine(player)}`,
    ``,
    ...changes.map((c) => `  ${c.field}: ${c.old ?? '—'} → ${c.new ?? '—'}`),
  ].join('\n')

  const changeRows = changes
    .map(
      (c) =>
        `<tr>
          <td style="padding: 6px 10px; border-bottom: 1px solid #eee; color: #666;">${escapeHtml(c.field)}</td>
          <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">
            <span style="color: #999; text-decoration: line-through; font-size: 12px;">${escapeHtml(c.old ?? '—')}</span>
            &rarr; <strong>${escapeHtml(c.new ?? '—')}</strong>
          </td>
        </tr>`
    )
    .join('')

  const html = wrapInBrandedLayout({
    heading: 'Profile Updated',
    badgeText: 'PROFILE',
    badgeColor: '#7c3aed',
    player,
    body: `
      <table style="border-collapse: collapse; font-size: 13px; width: 100%; background: #fff; border-radius: 6px; overflow: hidden; border: 1px solid #e0e0e0;">
        <thead>
          <tr style="background: #f4f4f5;">
            <th style="text-align: left; padding: 8px 10px; color: #666; font-weight: 500;">Field</th>
            <th style="text-align: left; padding: 8px 10px; color: #666; font-weight: 500;">Change</th>
          </tr>
        </thead>
        <tbody>${changeRows}</tbody>
      </table>
    `,
  })

  return { subject, html, text }
}
