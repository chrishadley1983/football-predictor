import { escapeHtml } from '../templates/shared'
import { buildUnsubscribeUrl } from '../sender'

export { escapeHtml }

/**
 * Wraps player-facing email content in the Freemo's brand layout.
 *
 * Visually warmer than the admin audit layout: bigger heading, lighter body,
 * always includes an unsubscribe footer (legal hygiene, CAN-SPAM/UK GDPR).
 */
export function wrapInPlayerLayout(opts: {
  heading: string
  preheader?: string
  body: string
  unsubscribeToken: string
  recipientEmail: string
}): string {
  const { heading, preheader, body, unsubscribeToken, recipientEmail } = opts
  const unsubUrl = buildUnsubscribeUrl(unsubscribeToken)

  const preheaderEl = preheader
    ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${escapeHtml(preheader)}</div>`
    : ''

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; color: #111;">
      ${preheaderEl}
      <div style="background: #1a5c3a; padding: 24px 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="margin: 0; color: #f5c542; font-size: 18px; font-weight: 700; letter-spacing: 0.5px;">FREEMO'S PREDICTION GAME</h1>
      </div>
      <div style="background: #fff; padding: 28px 24px; border: 1px solid #e0e0e0; border-top: none;">
        <h2 style="margin: 0 0 16px; font-size: 22px; color: #1a5c3a;">${escapeHtml(heading)}</h2>
        ${body}
      </div>
      <div style="background: #fafafa; padding: 16px 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="margin: 0; font-size: 11px; color: #888; line-height: 1.6;">
          You're receiving this because you registered for Freemo's Prediction Game with
          <a href="mailto:${escapeHtml(recipientEmail)}" style="color: #888;">${escapeHtml(recipientEmail)}</a>.<br/>
          <a href="${escapeHtml(unsubUrl)}" style="color: #1a5c3a; text-decoration: underline;">Unsubscribe from these emails</a>
        </p>
      </div>
    </div>
  `.trim()
}

/**
 * Plain-text unsubscribe footer for the text/plain alternative.
 */
export function renderTextFooter(opts: {
  unsubscribeToken: string
  recipientEmail: string
}): string {
  const unsubUrl = buildUnsubscribeUrl(opts.unsubscribeToken)
  return [
    '',
    '---',
    `You're receiving this because you registered for Freemo's Prediction Game with ${opts.recipientEmail}.`,
    `Unsubscribe: ${unsubUrl}`,
  ].join('\n')
}
