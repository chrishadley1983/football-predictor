import type { ChatMessageEvent } from '../audit'
import { escapeHtml, renderPlayerHtml, renderPlayerLine } from './shared'

export function renderChatMessage(
  e: ChatMessageEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, message } = e
  const where = tournament ? tournament.name : 'Global chat'

  const subject = `[FPG audit] Chat: ${player.displayName} in ${where}`

  const contentPreview = message.content.length > 80
    ? message.content.slice(0, 80) + '…'
    : message.content

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

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; color: #111;">
      <h2 style="margin: 0 0 12px;">Chat message</h2>
      <p style="margin: 0 0 12px; font-size: 14px; color: #555;">
        ${renderPlayerHtml(player)}<br>
        <span style="color: #666;">${tournament ? 'in' : ''}</span> <strong>${escapeHtml(where)}</strong>${tournament ? ` <span style="color:#999;">(${escapeHtml(tournament.slug)})</span>` : ''}<br>
        <span style="color: #999; font-size: 12px;">${escapeHtml(message.createdAt)}</span>
      </p>
      ${
        message.replyTo
          ? `<blockquote style="border-left: 3px solid #ddd; margin: 0 0 8px; padding: 4px 10px; color: #666; font-size: 13px;">
               <div style="font-weight: 600;">${escapeHtml(message.replyTo.authorName ?? '—')}</div>
               ${escapeHtml(message.replyTo.content)}
             </blockquote>`
          : ''
      }
      <div style="padding: 10px 14px; background: #f8f8f8; border-radius: 6px; font-size: 15px; white-space: pre-wrap;">${escapeHtml(message.content)}</div>
      ${
        gifUrl
          ? `<div style="margin-top: 10px;"><img src="${escapeHtml(gifUrl)}" alt="GIF" style="max-width: 300px; max-height: 300px; border-radius: 6px;" /></div>`
          : ''
      }
      <p style="margin: 12px 0 0; font-size: 11px; color: #aaa; font-family: monospace;">msg id ${escapeHtml(message.id)} · preview: "${escapeHtml(contentPreview)}"</p>
    </div>
  `.trim()

  return { subject, html, text }
}
