import type { KnockoutPredictionsConfirmationEvent } from '../user'
import { getSiteUrl } from '../sender'
import { escapeHtml, renderTextFooter, wrapInPlayerLayout } from './shared'

export function renderKnockoutPredictionsConfirmation(
  e: KnockoutPredictionsConfirmationEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, changes, isFirstSubmission } = e
  const verb = isFirstSubmission ? 'submitted' : 'updated'
  const subject = isFirstSubmission
    ? `Your knockout picks for ${tournament.name}`
    : `Your knockout picks for ${tournament.name} (updated)`

  const editUrl = `${getSiteUrl()}/tournament/${escapeHtml(tournament.slug)}/predict/knockout`

  // --- text ---
  const textLines = [
    `Hi ${player.displayName},`,
    ``,
    `Your knockout picks for ${tournament.name} have been ${verb}. Here's the current bracket:`,
    ``,
  ]
  for (const c of changes) {
    textLines.push(`${c.matchLabel} → ${c.new}`)
  }
  textLines.push(``)
  textLines.push(`Edit any time before the deadline:`)
  textLines.push(`${getSiteUrl()}/tournament/${tournament.slug}/predict/knockout`)
  textLines.push(``)
  textLines.push(`Good luck!`)
  textLines.push(`- Freemo's Prediction Game`)
  textLines.push(renderTextFooter({ unsubscribeToken: player.unsubscribeToken, recipientEmail: player.email }))

  const text = textLines.join('\n')

  // --- html ---
  const tableRows = changes
    .map((c, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#f9f9f9'
      return `<tr style="background: ${bg};">
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee;"><strong>${escapeHtml(c.matchLabel)}</strong></td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${escapeHtml(c.new)}</td>
      </tr>`
    })
    .join('')

  const body = `
    <p style="margin: 0 0 16px; font-size: 14px; color: #444;">
      Hi <strong>${escapeHtml(player.displayName)}</strong>, your knockout picks for
      <strong>${escapeHtml(tournament.name)}</strong> have been <strong>${verb}</strong>.
    </p>
    <table style="border-collapse: collapse; font-size: 13px; width: 100%; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: #1a5c3a; color: #fff;">
          <th style="text-align: left; padding: 8px 12px;">Match</th>
          <th style="text-align: left; padding: 8px 12px;">Your pick</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    <p style="margin: 24px 0;">
      <a href="${editUrl}" style="display: inline-block; background: #1a5c3a; color: #f5c542; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Edit my picks
      </a>
    </p>
    <p style="margin: 0; font-size: 13px; color: #666;">You can adjust any pick up to the round's deadline. Good luck!</p>
  `

  const html = wrapInPlayerLayout({
    heading: isFirstSubmission ? 'Knockout picks locked in' : 'Knockout picks updated',
    preheader: `Your ${verb} knockout picks for ${tournament.name}.`,
    body,
    unsubscribeToken: player.unsubscribeToken,
    recipientEmail: player.email,
  })

  return { subject, html, text }
}
