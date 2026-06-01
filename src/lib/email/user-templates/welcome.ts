import type { WelcomeEvent } from '../user'
import { getSiteUrl } from '../sender'
import { escapeHtml, renderTextFooter, wrapInPlayerLayout } from './shared'

export function renderWelcome(e: WelcomeEvent): { subject: string; html: string; text: string } {
  const { player } = e
  const displayName = player.displayName
  const siteUrl = getSiteUrl()

  const subject = `Welcome to Freemo's Prediction Game, ${displayName}!`

  const text = [
    `Hi ${displayName},`,
    ``,
    `Welcome to Freemo's Prediction Game! Your account is ready to go.`,
    ``,
    `What's next:`,
    `  - Browse open tournaments and enter the ones you fancy.`,
    `  - Lock in your group-stage predictions before kickoff.`,
    `  - Watch the leaderboard and chat with the other players.`,
    ``,
    `Sign in here: ${siteUrl}/login`,
    ``,
    `Good luck!`,
    `- Freemo's Prediction Game`,
    renderTextFooter({ unsubscribeToken: player.unsubscribeToken, recipientEmail: player.email }),
  ].join('\n')

  const body = `
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: #333;">
      Hi <strong>${escapeHtml(displayName)}</strong>,
    </p>
    <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: #333;">
      Welcome aboard. Your account is ready to go — sign in and you can start entering tournaments straight away.
    </p>
    <h3 style="margin: 24px 0 8px; font-size: 15px; color: #1a5c3a;">What's next</h3>
    <ul style="margin: 0 0 20px; padding-left: 20px; font-size: 14px; line-height: 1.7; color: #444;">
      <li>Browse open tournaments and enter the ones you fancy.</li>
      <li>Lock in your group-stage predictions before kickoff.</li>
      <li>Watch the leaderboard and chat with the other players.</li>
    </ul>
    <p style="margin: 24px 0;">
      <a href="${escapeHtml(siteUrl)}/login" style="display: inline-block; background: #1a5c3a; color: #f5c542; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Sign in
      </a>
    </p>
    <p style="margin: 16px 0 0; font-size: 14px; color: #666;">Good luck!</p>
    <p style="margin: 4px 0 0; font-size: 13px; color: #999;">— Freemo's Prediction Game</p>
  `

  const html = wrapInPlayerLayout({
    heading: 'Welcome aboard!',
    preheader: `Your account is ready — sign in and start predicting.`,
    body,
    unsubscribeToken: player.unsubscribeToken,
    recipientEmail: player.email,
  })

  return { subject, html, text }
}
