import type { GroupPredictionChange } from '../audit'
import { escapeHtml } from './shared'

/**
 * Build a nicely formatted prediction confirmation email for the player.
 * Sent when the player submits or modifies group predictions.
 */
export function renderPredictionConfirmation(opts: {
  playerName: string
  tournamentName: string
  changes: GroupPredictionChange[]
  tiebreaker: number | null
}): { subject: string; html: string; text: string } {
  const { playerName, tournamentName, changes, tiebreaker } = opts

  const subject = `Your predictions for ${tournamentName} - Freemo's Prediction Game`

  const text = [
    `Hi ${playerName},`,
    ``,
    `Here's a summary of your current predictions for ${tournamentName}:`,
    ``,
    ...changes.map(
      (c) =>
        `${c.groupName}: 1st ${c.new.first ?? '—'} / 2nd ${c.new.second ?? '—'} / 3rd ${c.new.third ?? '—'}`
    ),
    ``,
    ...(tiebreaker !== null ? [`Tiebreaker (total group stage goals): ${tiebreaker}`, ``] : []),
    `Good luck!`,
    `- Freemo's Prediction Game`,
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; color: #111; background: #fafafa; padding: 24px; border-radius: 12px;">
      <h2 style="margin: 0 0 4px; color: #1a5c3a;">Freemo's Prediction Game</h2>
      <h3 style="margin: 0 0 16px; color: #333; font-weight: normal;">Your predictions for <strong>${escapeHtml(tournamentName)}</strong></h3>
      <p style="margin: 0 0 16px; font-size: 14px; color: #666;">
        Hi ${escapeHtml(playerName)}, here's a summary of your current predictions:
      </p>
      <table style="border-collapse: collapse; font-size: 13px; width: 100%; background: #fff; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #1a5c3a; color: #fff;">
            <th style="text-align: left; padding: 8px 12px;">Group</th>
            <th style="text-align: left; padding: 8px 12px;">1st</th>
            <th style="text-align: left; padding: 8px 12px;">2nd</th>
            <th style="text-align: left; padding: 8px 12px;">3rd</th>
          </tr>
        </thead>
        <tbody>
          ${changes
            .map(
              (c, i) => {
                const bg = i % 2 === 0 ? '#fff' : '#f9f9f9'
                return `<tr style="background: ${bg};">
                  <td style="padding: 6px 12px; border-bottom: 1px solid #eee;"><strong>${escapeHtml(c.groupName)}</strong></td>
                  <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${escapeHtml(c.new.first ?? '—')}</td>
                  <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${escapeHtml(c.new.second ?? '—')}</td>
                  <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${escapeHtml(c.new.third ?? '—')}</td>
                </tr>`
              }
            )
            .join('')}
        </tbody>
      </table>
      ${
        tiebreaker !== null
          ? `<p style="margin: 16px 0 0; font-size: 14px;"><strong>Tiebreaker:</strong> ${tiebreaker} total group stage goals</p>`
          : ''
      }
      <p style="margin: 20px 0 0; font-size: 13px; color: #888;">
        Good luck! You can update your predictions any time before the deadline.
      </p>
    </div>
  `.trim()

  return { subject, html, text }
}
