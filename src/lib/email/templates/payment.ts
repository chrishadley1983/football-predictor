import type { PaymentStatusEvent } from '../audit'
import { escapeHtml, renderDetailTable, renderPlayerLine, wrapInBrandedLayout } from './shared'

export function renderPayment(
  e: PaymentStatusEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, entryId } = e

  const subject = `[Freemo's] Payment: ${player.displayName} → ${e.new} (${tournament.name})`

  const text = [
    `Payment status changed`,
    ``,
    `Player:     ${renderPlayerLine(player)}`,
    `Tournament: ${tournament.name} (${tournament.slug})`,
    `Entry ID:   ${entryId}`,
    `Status:     ${e.old} → ${e.new}`,
  ].join('\n')

  const statusColor = e.new === 'paid' ? '#059669' : '#d97706'

  const html = wrapInBrandedLayout({
    heading: 'Payment Status Changed',
    badgeText: e.new.toUpperCase(),
    badgeColor: statusColor,
    player,
    tournament,
    body: renderDetailTable([
      { label: 'Entry ID', value: escapeHtml(entryId), mono: true },
      {
        label: 'Status',
        value: `<span style="color: #999; text-decoration: line-through;">${escapeHtml(e.old)}</span> &rarr; <strong style="color: ${statusColor};">${escapeHtml(e.new)}</strong>`,
      },
    ]),
  })

  return { subject, html, text }
}
