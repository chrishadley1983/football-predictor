import type { SignUpEvent } from '../audit'
import { escapeHtml } from './shared'

export function renderSignUp(e: SignUpEvent): { subject: string; html: string; text: string } {
  const { player, createdAt } = e
  const name = player.displayName
  const nickname = player.nickname ? ` (${player.nickname})` : ''

  const subject = `[FPG audit] New signup: ${name}${nickname}`

  const text = [
    `New player registered`,
    ``,
    `Display name: ${player.displayName}`,
    `Nickname:     ${player.nickname ?? '—'}`,
    `Email:        ${player.email}`,
    `Player ID:    ${player.id}`,
    `Registered:   ${createdAt}`,
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; color: #111;">
      <h2 style="margin: 0 0 12px;">New player registered</h2>
      <table style="border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Display name</td><td style="padding: 4px 0;"><strong>${escapeHtml(player.displayName)}</strong></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Nickname</td><td style="padding: 4px 0;">${player.nickname ? escapeHtml(player.nickname) : '—'}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Email</td><td style="padding: 4px 0;"><a href="mailto:${escapeHtml(player.email)}">${escapeHtml(player.email)}</a></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Player ID</td><td style="padding: 4px 0; font-family: monospace; font-size: 12px;">${escapeHtml(player.id)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Registered</td><td style="padding: 4px 0;">${escapeHtml(createdAt)}</td></tr>
      </table>
    </div>
  `.trim()

  return { subject, html, text }
}
