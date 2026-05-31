import type { SignUpEvent } from '../audit'
import { escapeHtml, renderDetailTable, wrapInBrandedLayout } from './shared'

export function renderSignUp(e: SignUpEvent): { subject: string; html: string; text: string } {
  const { player, createdAt } = e
  const name = player.displayName
  const nickname = player.nickname ? ` (${player.nickname})` : ''

  const subject = `[Freemo's] New signup: ${name}${nickname}`

  const text = [
    `New player registered`,
    ``,
    `Display name: ${player.displayName}`,
    `Nickname:     ${player.nickname ?? '—'}`,
    `Email:        ${player.email}`,
    `Player ID:    ${player.id}`,
    `Registered:   ${createdAt}`,
  ].join('\n')

  const html = wrapInBrandedLayout({
    heading: 'New Player Registered',
    badgeText: 'SIGNUP',
    badgeColor: '#2563eb',
    body: renderDetailTable([
      { label: 'Display name', value: `<strong>${escapeHtml(player.displayName)}</strong>` },
      { label: 'Nickname', value: player.nickname ? escapeHtml(player.nickname) : '<span style="color:#999;">—</span>' },
      { label: 'Email', value: `<a href="mailto:${escapeHtml(player.email)}" style="color: #1a5c3a;">${escapeHtml(player.email)}</a>` },
      { label: 'Player ID', value: escapeHtml(player.id), mono: true },
      { label: 'Registered', value: escapeHtml(createdAt) },
    ]),
  })

  return { subject, html, text }
}
