import type { PaymentStatusEvent } from '../audit'
import { escapeHtml, renderPlayerHtml, renderPlayerLine } from './shared'

export function renderPayment(
  e: PaymentStatusEvent
): { subject: string; html: string; text: string } {
  const { player, tournament, entryId } = e

  const subject = `[FPG audit] Payment: ${player.displayName} → ${e.new} (${tournament.name})`

  const text = [
    `Payment status changed`,
    ``,
    `Player:     ${renderPlayerLine(player)}`,
    `Tournament: ${tournament.name} (${tournament.slug})`,
    `Entry ID:   ${entryId}`,
    `Status:     ${e.old} → ${e.new}`,
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; color: #111;">
      <h2 style="margin: 0 0 12px;">Payment status changed</h2>
      <table style="border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Player</td><td style="padding: 4px 0;">${renderPlayerHtml(player)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Tournament</td><td style="padding: 4px 0;"><strong>${escapeHtml(tournament.name)}</strong> (${escapeHtml(tournament.slug)})</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Entry ID</td><td style="padding: 4px 0; font-family: monospace; font-size: 12px;">${escapeHtml(entryId)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color: #666;">Status</td><td style="padding: 4px 0;"><span style="color: #999; text-decoration: line-through;">${escapeHtml(e.old)}</span> → <strong>${escapeHtml(e.new)}</strong></td></tr>
      </table>
    </div>
  `.trim()

  return { subject, html, text }
}
