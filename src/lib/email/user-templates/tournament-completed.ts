import type { TournamentCompletedEvent } from '../user'
import { getSiteUrl } from '../sender'
import { escapeHtml, renderTextFooter, wrapInPlayerLayout } from './shared'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function formatGbp(amount: number | null): string | null {
  if (amount === null || amount === undefined) return null
  return `£${amount.toFixed(2)}`
}

function prettyPrizeType(t: string): string {
  return t
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function renderTournamentCompleted(
  e: TournamentCompletedEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, myFinish, myHonours, topThree } = e
  const honoursUrl = `${getSiteUrl()}/honours`
  const resultsUrl = `${getSiteUrl()}/tournament/${tournament.slug}/results`
  const leaderboardUrl = `${getSiteUrl()}/tournament/${tournament.slug}/leaderboard`

  const finishLabel = myFinish.rank ? `${ordinal(myFinish.rank)} place` : 'Unranked'
  const wonAnything = myHonours.length > 0
  const totalPrize = myHonours.reduce((sum, h) => sum + (h.prizeAmountGbp ?? 0), 0)

  const subject = wonAnything
    ? `🏆 ${tournament.name} is done — congratulations!`
    : `${tournament.name} is done — final standings inside`

  // --- text ---
  const textLines = [
    `Hi ${player.displayName},`,
    ``,
    `${tournament.name} is in the books. Here's how it ended:`,
    ``,
    `Your finish: ${finishLabel} (${myFinish.totalPoints} pts)`,
  ]
  if (wonAnything) {
    textLines.push(``)
    textLines.push(`You won:`)
    for (const h of myHonours) {
      const amt = formatGbp(h.prizeAmountGbp)
      textLines.push(`  • ${h.description || prettyPrizeType(h.prizeType as string)}${amt ? ` — ${amt}` : ''}`)
    }
    if (totalPrize > 0) {
      textLines.push(``)
      textLines.push(`Total prize: ${formatGbp(totalPrize)}`)
    }
  }
  textLines.push(``)
  textLines.push(`Top 3:`)
  for (const t of topThree) {
    textLines.push(`  ${ordinal(t.rank)}: ${t.displayName} (${t.totalPoints} pts)`)
  }
  textLines.push(``)
  textLines.push(`Full leaderboard: ${leaderboardUrl}`)
  textLines.push(`Honours board:   ${honoursUrl}`)
  textLines.push(`Results:         ${resultsUrl}`)
  textLines.push(``)
  textLines.push(`Thanks for playing — until next time.`)
  textLines.push(`- Freemo's Prediction Game`)
  textLines.push(renderTextFooter({ unsubscribeToken: player.unsubscribeToken, recipientEmail: player.email }))

  const text = textLines.join('\n')

  // --- html ---
  const honoursRows = myHonours
    .map((h, i) => {
      const bg = i % 2 === 0 ? '#fff' : '#fffbe8'
      const amt = formatGbp(h.prizeAmountGbp)
      return `<tr style="background: ${bg};">
        <td style="padding: 8px 12px; border-bottom: 1px solid #f0e8c8;">
          <strong style="color: #806519;">${escapeHtml(h.description || prettyPrizeType(h.prizeType as string))}</strong>
        </td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #f0e8c8; text-align: right;">
          ${amt ? `<strong style="color: #806519;">${escapeHtml(amt)}</strong>` : '<span style="color: #aaa;">—</span>'}
        </td>
      </tr>`
    })
    .join('')

  const honoursSection = wonAnything
    ? `
      <h3 style="margin: 24px 0 8px; color: #806519; font-size: 16px;">🏆 You won</h3>
      <table style="border-collapse: collapse; font-size: 14px; width: 100%; background: #fffbe8; border: 1px solid #f0e8c8; border-radius: 8px; overflow: hidden;">
        <tbody>${honoursRows}</tbody>
      </table>
      ${totalPrize > 0 ? `<p style="margin: 8px 0 0; font-size: 13px; color: #806519; text-align: right;"><strong>Total prize: ${escapeHtml(formatGbp(totalPrize) || '')}</strong></p>` : ''}
    `
    : ''

  const topThreeRows = topThree
    .map((t) => {
      const medal = t.rank === 1 ? '🥇' : t.rank === 2 ? '🥈' : t.rank === 3 ? '🥉' : ''
      return `<tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; width: 40px;">${medal}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee;"><strong>${escapeHtml(t.displayName)}</strong></td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #eee; text-align: right; color: #666;">${t.totalPoints} pts</td>
      </tr>`
    })
    .join('')

  const myFinishBg = myFinish.rank === 1 ? '#fffbe8' : '#f5fbf7'
  const myFinishBorder = myFinish.rank === 1 ? '#f5c542' : '#1a5c3a'

  const body = `
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.5; color: #333;">
      Hi <strong>${escapeHtml(player.displayName)}</strong>, <strong>${escapeHtml(tournament.name)}</strong>
      is in the books. Here's how it ended.
    </p>
    <div style="margin: 0 0 20px; padding: 16px 20px; background: ${myFinishBg}; border-left: 4px solid ${myFinishBorder}; border-radius: 4px;">
      <p style="margin: 0 0 4px; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Your finish</p>
      <p style="margin: 0; font-size: 22px; font-weight: 700; color: #1a5c3a;">
        ${escapeHtml(finishLabel)}
        <span style="font-size: 14px; color: #666; font-weight: 400;">&middot; ${myFinish.totalPoints} pts</span>
      </p>
    </div>
    ${honoursSection}
    <h3 style="margin: 28px 0 8px; color: #1a5c3a; font-size: 16px;">Top 3</h3>
    <table style="border-collapse: collapse; font-size: 14px; width: 100%; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <tbody>${topThreeRows}</tbody>
    </table>
    <p style="margin: 28px 0;">
      <a href="${leaderboardUrl}" style="display: inline-block; background: #1a5c3a; color: #f5c542; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Full leaderboard
      </a>
      <a href="${honoursUrl}" style="display: inline-block; margin-left: 8px; background: transparent; color: #1a5c3a; padding: 12px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; border: 1px solid #1a5c3a;">
        Honours board
      </a>
    </p>
    <p style="margin: 16px 0 0; font-size: 13px; color: #666;">Thanks for playing — until next time.</p>
    <p style="margin: 4px 0 0; font-size: 12px; color: #999;">— Freemo's Prediction Game</p>
  `

  const html = wrapInPlayerLayout({
    heading: wonAnything ? 'Congratulations!' : 'Tournament complete',
    preheader: `${tournament.name} finished. You came ${finishLabel.toLowerCase()} with ${myFinish.totalPoints} pts.`,
    body,
    unsubscribeToken: player.unsubscribeToken,
    recipientEmail: player.email,
  })

  return { subject, html, text }
}
