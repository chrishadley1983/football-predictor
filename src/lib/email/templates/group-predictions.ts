import type { GroupPredictionsEvent, GroupPredictionSnapshot } from '../audit'
import { escapeHtml, renderPlayerHtml, renderPlayerLine } from './shared'

export function renderGroupPredictions(
  e: GroupPredictionsEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, changes, tiebreaker } = e

  const groupsChanged = changes.filter((c) => c.changed)
  const countText =
    groupsChanged.length === 0
      ? 'tiebreaker-only update'
      : `${groupsChanged.length} group${groupsChanged.length === 1 ? '' : 's'} changed`

  const subject = `[FPG audit] Group predictions: ${player.displayName} — ${countText}`

  const text = [
    `Group predictions submitted`,
    ``,
    `Player:     ${renderPlayerLine(player)}`,
    `Tournament: ${tournament.name} (${tournament.slug})`,
    ``,
    ...changes.map((c) => renderChangeText(c)),
    ...(tiebreaker && tiebreaker.changed
      ? ['', `Tiebreaker goals: ${tiebreaker.old ?? '—'} → ${tiebreaker.new ?? '—'}`]
      : []),
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; color: #111;">
      <h2 style="margin: 0 0 12px;">Group predictions submitted</h2>
      <p style="margin: 0 0 12px; font-size: 14px;">
        <span style="color: #666;">Player:</span> ${renderPlayerHtml(player)}<br>
        <span style="color: #666;">Tournament:</span> <strong>${escapeHtml(tournament.name)}</strong> (${escapeHtml(tournament.slug)})
      </p>
      <table style="border-collapse: collapse; font-size: 13px; width: 100%;">
        <thead>
          <tr style="background: #f4f4f4;">
            <th style="text-align: left; padding: 6px 10px; border: 1px solid #ddd;">Group</th>
            <th style="text-align: left; padding: 6px 10px; border: 1px solid #ddd;">1st</th>
            <th style="text-align: left; padding: 6px 10px; border: 1px solid #ddd;">2nd</th>
            <th style="text-align: left; padding: 6px 10px; border: 1px solid #ddd;">3rd</th>
          </tr>
        </thead>
        <tbody>
          ${changes.map((c) => renderChangeHtml(c)).join('')}
        </tbody>
      </table>
      ${
        tiebreaker && tiebreaker.changed
          ? `<p style="margin: 12px 0 0; font-size: 14px;"><span style="color: #666;">Tiebreaker goals:</span> ${tiebreaker.old ?? '—'} → <strong>${tiebreaker.new ?? '—'}</strong></p>`
          : ''
      }
    </div>
  `.trim()

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
  const bg = c.changed ? '#fff8dc' : '#fff'
  const row = `<td style="padding: 6px 10px; border: 1px solid #ddd; background: ${bg};">`
  const renderPos = (pos: 'first' | 'second' | 'third') => {
    const prev = c.old?.[pos] ?? null
    const next = c.new[pos] ?? null
    if (c.changed && prev !== next) {
      return `<span style="color: #999; text-decoration: line-through;">${escapeHtml(prev ?? '—')}</span> → <strong>${escapeHtml(next ?? '—')}</strong>`
    }
    return escapeHtml(next ?? '—')
  }
  return `<tr>${row}<strong>${escapeHtml(c.groupName)}</strong>${c.changed ? '' : ' <span style="color:#999;">(unchanged)</span>'}</td>${row}${renderPos('first')}</td>${row}${renderPos('second')}</td>${row}${renderPos('third')}</td></tr>`
}
