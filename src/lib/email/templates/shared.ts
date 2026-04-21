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
