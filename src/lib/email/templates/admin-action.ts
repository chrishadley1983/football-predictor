import type { AdminActionEvent } from '../audit'
import { escapeHtml } from './shared'

const ACTION_LABELS: Record<AdminActionEvent['action'], string> = {
  seed_tournament: 'Seed tournament',
  reset_test_data: 'Reset test data',
  force_complete: 'Force-complete',
  status_change: 'Status change',
}

export function renderAdminAction(
  e: AdminActionEvent
): { subject: string; html: string; text: string } {
  const label = ACTION_LABELS[e.action]
  const scope = e.tournament ? ` (${e.tournament.slug})` : ''

  const subject = `[FPG audit] Admin — ${label}${scope}: ${e.summary}`

  const detailLines: string[] = []
  const detailRows: string[] = []
  if (e.details) {
    for (const [k, v] of Object.entries(e.details)) {
      const value = v === null ? '—' : String(v)
      detailLines.push(`  ${k}: ${value}`)
      detailRows.push(
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">${escapeHtml(k)}</td><td style="padding: 4px 0; font-family: monospace; font-size: 12px;">${escapeHtml(value)}</td></tr>`
      )
    }
  }

  const text = [
    `Admin action: ${label}`,
    ``,
    `Summary:    ${e.summary}`,
    ...(e.tournament
      ? [`Tournament: ${e.tournament.name} (${e.tournament.slug})`]
      : []),
    ...(detailLines.length ? ['', 'Details:', ...detailLines] : []),
  ].join('\n')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; color: #111;">
      <h2 style="margin: 0 0 12px;">⚠️ Admin action — ${escapeHtml(label)}</h2>
      <p style="margin: 0 0 12px; font-size: 14px;"><strong>${escapeHtml(e.summary)}</strong></p>
      ${
        e.tournament
          ? `<p style="margin: 0 0 12px; font-size: 14px;"><span style="color: #666;">Tournament:</span> ${escapeHtml(e.tournament.name)} (${escapeHtml(e.tournament.slug)})</p>`
          : ''
      }
      ${
        detailRows.length
          ? `<table style="border-collapse: collapse; font-size: 14px; margin-top: 8px;">${detailRows.join('')}</table>`
          : ''
      }
    </div>
  `.trim()

  return { subject, html, text }
}
