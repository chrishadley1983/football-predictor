export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderPlayerLine(player: {
  displayName: string
  nickname: string | null
  email: string
}): string {
  const nick = player.nickname ? ` "${player.nickname}"` : ''
  return `${player.displayName}${nick} <${player.email}>`
}

export function renderPlayerHtml(player: {
  displayName: string
  nickname: string | null
  email: string
}): string {
  const nick = player.nickname ? ` <em>${escapeHtml(player.nickname)}</em>` : ''
  return `<strong>${escapeHtml(player.displayName)}</strong>${nick} &lt;${escapeHtml(player.email)}&gt;`
}

/**
 * Wraps email body content in a consistent branded layout.
 * Used for all admin audit emails.
 */
export function wrapInBrandedLayout(opts: {
  heading: string
  badgeColor?: string
  badgeText?: string
  player?: { displayName: string; nickname: string | null; email: string }
  tournament?: { name: string; slug: string }
  body: string
}): string {
  const { heading, badgeColor = '#1a5c3a', badgeText, player, tournament, body } = opts

  const badge = badgeText
    ? `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #fff; background: ${badgeColor}; margin-left: 8px; vertical-align: middle;">${escapeHtml(badgeText)}</span>`
    : ''

  const playerBlock = player
    ? `<p style="margin: 0 0 4px; font-size: 13px; color: #555;">
        <strong style="color: #111;">${escapeHtml(player.displayName)}</strong>${player.nickname ? ` <em style="color: #888;">(${escapeHtml(player.nickname)})</em>` : ''}
        &middot; <a href="mailto:${escapeHtml(player.email)}" style="color: #1a5c3a; text-decoration: none;">${escapeHtml(player.email)}</a>
      </p>`
    : ''

  const tournamentBlock = tournament
    ? `<p style="margin: 0 0 12px; font-size: 13px; color: #555;">
        Tournament: <strong style="color: #111;">${escapeHtml(tournament.name)}</strong>
        <span style="color: #999; font-size: 12px;">(${escapeHtml(tournament.slug)})</span>
      </p>`
    : ''

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; color: #111;">
      <div style="background: #1a5c3a; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; color: #f5c542; font-size: 14px; font-weight: 600; letter-spacing: 0.5px;">FREEMO'S PREDICTION GAME</h2>
      </div>
      <div style="background: #fafafa; padding: 20px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
        <h3 style="margin: 0 0 12px; font-size: 16px; color: #111;">${escapeHtml(heading)}${badge}</h3>
        ${playerBlock}
        ${tournamentBlock}
        ${body}
        <hr style="margin: 20px 0 12px; border: none; border-top: 1px solid #e0e0e0;" />
        <p style="margin: 0; font-size: 11px; color: #999; text-align: center;">
          Admin notification &middot; Freemo's Prediction Game
        </p>
      </div>
    </div>
  `.trim()
}

/**
 * Renders a styled detail table (label-value pairs) for admin emails.
 */
export function renderDetailTable(rows: { label: string; value: string; mono?: boolean }[]): string {
  return `
    <table style="border-collapse: collapse; font-size: 13px; width: 100%; margin: 8px 0;">
      ${rows
        .map(
          (r) =>
            `<tr>
              <td style="padding: 5px 12px 5px 0; color: #666; white-space: nowrap; vertical-align: top;">${escapeHtml(r.label)}</td>
              <td style="padding: 5px 0; ${r.mono ? 'font-family: monospace; font-size: 12px;' : ''}">${r.value}</td>
            </tr>`
        )
        .join('')}
    </table>
  `
}
