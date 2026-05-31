import type { ChatMessageEvent } from '../audit'
import { escapeHtml, renderPlayerLine, wrapInBrandedLayout } from './shared'

export function renderChatMessage(
  e: ChatMessageEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, message } = e
  const where = tournament ? tournament.name : 'Global chat'

  const subject = `[Freemo's] Chat: ${player.displayName} in ${where}`

  const gifUrl =
    message.metadata && typeof message.metadata === 'object' && 'gif_url' in message.metadata
      ? String(message.metadata.gif_url ?? '')
      : null

  const textLines = [
    `Chat message`,
    ``,
    `Player:     ${renderPlayerLine(player)}`,
    `Where:      ${where}${tournament ? ` (${tournament.slug})` : ''}`,
    `Sent:       ${message.createdAt}`,
    `Message ID: ${message.id}`,
    ``,
  ]
  if (message.replyTo) {
    textLines.push(
      `↳ In reply to ${message.replyTo.authorName ?? '—'}: "${message.replyTo.content.slice(0, 120)}${message.replyTo.content.length > 120 ? '…' : ''}"`,
      ``
    )
  }
  textLines.push(`"${message.content}"`)
  if (gifUrl) {
    textLines.push(``, `GIF: ${gifUrl}`)
  }

  const text = textLines.join('\n')

  const replyBlock = message.replyTo
    ? `<div style="border-left: 3px solid #d4d4d8; margin: 0 0 10px; padding: 6px 12px; background: #fafafa; border-radius: 0 6px 6px 0;">
         <div style="font-weight: 600; font-size: 12px; color: #666; margin-bottom: 2px;">${escapeHtml(message.replyTo.authorName ?? '—')}</div>
         <div style="font-size: 13px; color: #555;">${escapeHtml(message.replyTo.content)}</div>
       </div>`
    : ''

  const gifBlock = gifUrl
    ? `<div style="margin-top: 10px;"><img src="${escapeHtml(gifUrl)}" alt="GIF" style="max-width: 300px; max-height: 300px; border-radius: 6px;" /></div>`
    : ''

  const html = wrapInBrandedLayout({
    heading: 'Chat Message',
    badgeText: 'CHAT',
    badgeColor: '#2563eb',
    player,
    ...(tournament ? { tournament } : {}),
    body: `
      ${replyBlock}
      <div style="padding: 12px 14px; background: #f4f4f5; border-radius: 8px; font-size: 15px; white-space: pre-wrap; line-height: 1.5;">${escapeHtml(message.content)}</div>
      ${gifBlock}
      <p style="margin: 10px 0 0; font-size: 11px; color: #aaa; font-family: monospace;">msg ${escapeHtml(message.id)} · ${escapeHtml(message.createdAt)}</p>
    `,
  })

  return { subject, html, text }
}
