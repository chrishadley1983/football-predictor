import type { GroupPredictionsConfirmationEvent } from '../user'
import { getSiteUrl } from '../sender'
import { escapeHtml, renderTextFooter, wrapInPlayerLayout } from './shared'

export function renderGroupPredictionsConfirmation(
  e: GroupPredictionsConfirmationEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, changes, tiebreaker, isFirstSubmission } = e
  const verb = isFirstSubmission ? 'submitted' : 'updated'
  const subject = isFirstSubmission
    ? `Your group predictions for ${tournament.name}`
    : `Your group predictions for ${tournament.name} (updated)`

  // Detect partial third-place tournaments (e.g. WC2026 with 8-of-12 qualifiers).
  const thirdPlacePicks = changes.filter((c) => c.new.third !== null)
  const hasPartialThirdPlace = thirdPlacePicks.length > 0 && thirdPlacePicks.length < changes.length
  const hasAllThirdPlace = thirdPlacePicks.length === changes.length

  // --- text ---
  const textLines = [
    `Hi ${player.displayName},`,
    ``,
    `Your group-stage predictions for ${tournament.name} have been ${verb}. Here's where you stand:`,
    ``,
  ]
  if (hasPartialThirdPlace) {
    for (const c of changes) {
      textLines.push(`${c.groupName}: 1st ${c.new.first ?? '—'} / 2nd ${c.new.second ?? '—'}`)
    }
    textLines.push(``)
    textLines.push(`3rd Place Qualifiers (${thirdPlacePicks.length}):`)
    for (const c of thirdPlacePicks) {
      textLines.push(`  ${c.groupName}: ${c.new.third}`)
    }
  } else {
    for (const c of changes) {
      textLines.push(
        `${c.groupName}: 1st ${c.new.first ?? '—'} / 2nd ${c.new.second ?? '—'} / 3rd ${c.new.third ?? '—'}`
      )
    }
  }
  textLines.push(``)
  if (tiebreaker !== null) {
    textLines.push(`Tiebreaker (total group stage goals): ${tiebreaker}`)
    textLines.push(``)
  }
  textLines.push(`You can change these any time before the deadline:`)
  textLines.push(`${getSiteUrl()}/tournament/${tournament.slug}/predict/groups`)
  textLines.push(``)
  textLines.push(`Good luck!`)
  textLines.push(`- Freemo's Prediction Game`)
  textLines.push(renderTextFooter({ unsubscribeToken: player.unsubscribeToken, recipientEmail: player.email }))

  const text = textLines.join('\n')

  // --- html ---
  const showThirdColumn = hasAllThirdPlace
  const editUrl = `${getSiteUrl()}/tournament/${escapeHtml(tournament.slug)}/predict/groups`

  const mainTableRows = changes
    .map((c, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#f9f9f9'
      const thirdCol = showThirdColumn
        ? `<td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${escapeHtml(c.new.third ?? '—')}</td>`
        : ''
      return `<tr style="background: ${bg};">
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee;"><strong>${escapeHtml(c.groupName)}</strong></td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${escapeHtml(c.new.first ?? '—')}</td>
        <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${escapeHtml(c.new.second ?? '—')}</td>
        ${thirdCol}
      </tr>`
    })
    .join('')

  const thirdHeader = showThirdColumn ? '<th style="text-align: left; padding: 8px 12px;">3rd</th>' : ''

  const thirdPlaceSection = hasPartialThirdPlace
    ? `
      <h4 style="margin: 20px 0 8px; color: #1a5c3a; font-size: 14px;">3rd Place Qualifiers (${thirdPlacePicks.length})</h4>
      <table style="border-collapse: collapse; font-size: 13px; width: 100%; background: #fff; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #1a5c3a; color: #fff;">
            <th style="text-align: left; padding: 8px 12px;">Group</th>
            <th style="text-align: left; padding: 8px 12px;">3rd Place</th>
          </tr>
        </thead>
        <tbody>
          ${thirdPlacePicks
            .map((c, i) => {
              const bg = i % 2 === 0 ? '#fff' : '#f9f9f9'
              return `<tr style="background: ${bg};">
                <td style="padding: 6px 12px; border-bottom: 1px solid #eee;"><strong>${escapeHtml(c.groupName)}</strong></td>
                <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${escapeHtml(c.new.third ?? '—')}</td>
              </tr>`
            })
            .join('')}
        </tbody>
      </table>`
    : ''

  const body = `
    <p style="margin: 0 0 16px; font-size: 14px; color: #444;">
      Hi <strong>${escapeHtml(player.displayName)}</strong>, your group-stage predictions for
      <strong>${escapeHtml(tournament.name)}</strong> have been <strong>${verb}</strong>.
      Here's the current snapshot:
    </p>
    <table style="border-collapse: collapse; font-size: 13px; width: 100%; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: #1a5c3a; color: #fff;">
          <th style="text-align: left; padding: 8px 12px;">Group</th>
          <th style="text-align: left; padding: 8px 12px;">1st</th>
          <th style="text-align: left; padding: 8px 12px;">2nd</th>
          ${thirdHeader}
        </tr>
      </thead>
      <tbody>
        ${mainTableRows}
      </tbody>
    </table>
    ${thirdPlaceSection}
    ${tiebreaker !== null ? `<p style="margin: 16px 0 0; font-size: 14px;"><strong>Tiebreaker:</strong> ${tiebreaker} total group stage goals</p>` : ''}
    <p style="margin: 24px 0;">
      <a href="${editUrl}" style="display: inline-block; background: #1a5c3a; color: #f5c542; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Edit my predictions
      </a>
    </p>
    <p style="margin: 0; font-size: 13px; color: #666;">You can change these any time before the group-stage deadline. Good luck!</p>
  `

  const html = wrapInPlayerLayout({
    heading: isFirstSubmission ? 'Predictions locked in' : 'Predictions updated',
    preheader: `Your ${verb} group predictions for ${tournament.name}.`,
    body,
    unsubscribeToken: player.unsubscribeToken,
    recipientEmail: player.email,
  })

  return { subject, html, text }
}
