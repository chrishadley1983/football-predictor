import type { GroupPredictionsEvent, GroupPredictionSnapshot } from '../audit'
import { escapeHtml, wrapInBrandedLayout } from './shared'

export function renderGroupPredictions(
  e: GroupPredictionsEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, changes, tiebreaker } = e

  const groupsChanged = changes.filter((c) => c.changed)
  const countText =
    groupsChanged.length === 0
      ? 'tiebreaker-only update'
      : `${groupsChanged.length} group${groupsChanged.length === 1 ? '' : 's'} changed`

  const subject = `[Freemo's] Group predictions: ${player.displayName} — ${countText}`

  const text = [
    `Group predictions submitted`,
    ``,
    `Player:     ${player.displayName} <${player.email}>`,
    `Tournament: ${tournament.name} (${tournament.slug})`,
    ``,
    ...changes.map((c) => renderChangeText(c)),
    ...(tiebreaker && tiebreaker.changed
      ? ['', `Tiebreaker goals: ${tiebreaker.old ?? '—'} → ${tiebreaker.new ?? '—'}`]
      : []),
  ].join('\n')

  const tableRows = changes.map((c) => renderChangeHtml(c)).join('')

  const tiebreakerHtml =
    tiebreaker && tiebreaker.changed
      ? `<p style="margin: 12px 0 0; font-size: 13px;">
          <strong>Tiebreaker:</strong>
          <span style="color: #999; text-decoration: line-through;">${tiebreaker.old ?? '—'}</span>
          &rarr; <strong>${tiebreaker.new ?? '—'}</strong> goals
        </p>`
      : ''

  const html = wrapInBrandedLayout({
    heading: 'Group Predictions Submitted',
    badgeText: countText.toUpperCase(),
    badgeColor: groupsChanged.length > 0 ? '#d97706' : '#6b7280',
    player,
    tournament,
    body: `
      <table style="border-collapse: collapse; font-size: 13px; width: 100%; background: #fff; border-radius: 6px; overflow: hidden; border: 1px solid #e0e0e0;">
        <thead>
          <tr style="background: #1a5c3a; color: #fff;">
            <th style="text-align: left; padding: 8px 10px;">Group</th>
            <th style="text-align: left; padding: 8px 10px;">1st</th>
            <th style="text-align: left; padding: 8px 10px;">2nd</th>
            <th style="text-align: left; padding: 8px 10px;">3rd</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      ${tiebreakerHtml}
    `,
  })

  return { subject, html, text }
}

function renderChangeText(c: {
  groupName: string
  old: GroupPredictionSnapshot | null
  new: GroupPredictionSnapshot
  changed: boolean
}): string {
  if (!c.changed) {
    return `${c.groupName}: 1st ${c.new.first ?? '—'} / 2nd ${c.new.second ?? '—'} / 3rd ${c.new.third ?? '—'} (unchanged)`
  }
  const old = c.old
  const lines: string[] = [`${c.groupName} (changed):`]
  for (const pos of ['first', 'second', 'third'] as const) {
    const label = pos === 'first' ? '1st' : pos === 'second' ? '2nd' : '3rd'
    const prev = old?.[pos] ?? null
    const next = c.new[pos] ?? null
    if (prev !== next) {
      lines.push(`  ${label}: ${prev ?? '—'} → ${next ?? '—'}`)
    } else {
      lines.push(`  ${label}: ${next ?? '—'}`)
    }
  }
  return lines.join('\n')
}

function renderChangeHtml(c: {
  groupName: string
  old: GroupPredictionSnapshot | null
  new: GroupPredictionSnapshot
  changed: boolean
}): string {
  const bg = c.changed ? '#fef3c7' : '#fff'
  const renderPos = (pos: 'first' | 'second' | 'third') => {
    const prev = c.old?.[pos] ?? null
    const next = c.new[pos] ?? null
    if (c.changed && prev !== next) {
      const prevHtml = prev ? `<span style="color: #999; text-decoration: line-through; font-size: 11px;">${escapeHtml(prev)}</span> ` : ''
      return `${prevHtml}<strong>${escapeHtml(next ?? '—')}</strong>`
    }
    return escapeHtml(next ?? '—')
  }

  const statusIcon = c.changed
    ? '<span style="color: #d97706; font-size: 10px;">&#9679;</span> '
    : ''

  return `<tr style="background: ${bg};">
    <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${statusIcon}<strong>${escapeHtml(c.groupName)}</strong></td>
    <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${renderPos('first')}</td>
    <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${renderPos('second')}</td>
    <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">${renderPos('third')}</td>
  </tr>`
}
