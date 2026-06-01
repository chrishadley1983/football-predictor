import type { KnockoutOpenAnnouncementEvent } from '../user'
import { getSiteUrl } from '../sender'
import { escapeHtml, renderTextFooter, wrapInPlayerLayout } from './shared'

function formatDeadline(iso: string | null): string | null {
  if (!iso) return null
  try {
    const date = new Date(iso)
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date)
  } catch {
    return iso
  }
}

export function renderKnockoutOpenAnnouncement(
  e: KnockoutOpenAnnouncementEvent
): { subject: string; html: string; text: string } {
  const { player, tournament } = e
  const subject = `🏆 Knockout predictions are open — ${tournament.name}`
  const pickUrl = `${getSiteUrl()}/tournament/${tournament.slug}/predict/knockout`
  const deadlineHuman = formatDeadline(tournament.knockoutDeadline)

  // --- text ---
  const text = [
    `Hi ${player.displayName},`,
    ``,
    `The group stage is done — knockout predictions are now OPEN for ${tournament.name}.`,
    ``,
    `Pick your winners through every round, all the way to the final. Don't forget your Emergency Sub.`,
    ``,
    deadlineHuman ? `Deadline: ${deadlineHuman}` : `Lock in before the first knockout kickoff.`,
    ``,
    `Make your picks: ${pickUrl}`,
    ``,
    `Good luck!`,
    `- Freemo's Prediction Game`,
    renderTextFooter({ unsubscribeToken: player.unsubscribeToken, recipientEmail: player.email }),
  ].join('\n')

  // --- html ---
  const body = `
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: #333;">
      Hi <strong>${escapeHtml(player.displayName)}</strong>,
    </p>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: #333;">
      The group stage is done and <strong>knockout predictions are now open</strong>
      for <strong>${escapeHtml(tournament.name)}</strong>.
    </p>
    <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #444;">
      Pick winners through every round, all the way to the final. Don't forget your Emergency Sub — one knockout swap could change everything.
    </p>
    ${
      deadlineHuman
        ? `<div style="margin: 20px 0; padding: 12px 16px; background: #fffbe8; border-left: 4px solid #f5c542; border-radius: 4px;">
            <p style="margin: 0; font-size: 13px; color: #806519;">
              <strong>Deadline:</strong> ${escapeHtml(deadlineHuman)}
            </p>
          </div>`
        : `<p style="margin: 16px 0; font-size: 13px; color: #888;">Lock in before the first knockout kickoff.</p>`
    }
    <p style="margin: 24px 0;">
      <a href="${pickUrl}" style="display: inline-block; background: #1a5c3a; color: #f5c542; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Make my picks
      </a>
    </p>
    <p style="margin: 16px 0 0; font-size: 13px; color: #666;">Good luck!</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #999;">— Freemo's Prediction Game</p>
  `

  const html = wrapInPlayerLayout({
    heading: 'Knockout stage is open',
    preheader: `Pick winners through every round of ${tournament.name}.`,
    body,
    unsubscribeToken: player.unsubscribeToken,
    recipientEmail: player.email,
  })

  return { subject, html, text }
}
