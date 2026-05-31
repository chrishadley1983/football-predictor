import type { AdminActionEvent } from '../audit'
import { escapeHtml, renderDetailTable, wrapInBrandedLayout } from './shared'

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

  const subject = `[Freemo's] Admin — ${label}${scope}: ${e.summary}`

  const detailLines: string[] = []
  const detailTableRows: { label: string; value: string; mono?: boolean }[] = []
  if (e.details) {
    for (const [k, v] of Object.entries(e.details)) {
      const value = v === null ? '—' : String(v)
      detailLines.push(`  ${k}: ${value}`)
      detailTableRows.push({ label: k, value: escapeHtml(value), mono: true })
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

  const html = wrapInBrandedLayout({
    heading: `Admin: ${label}`,
    badgeText: 'ADMIN',
    badgeColor: '#dc2626',
    ...(e.tournament ? { tournament: e.tournament } : {}),
    body: `
      <p style="margin: 0 0 12px; font-size: 14px;"><strong>${escapeHtml(e.summary)}</strong></p>
      ${detailTableRows.length ? renderDetailTable(detailTableRows) : ''}
    `,
  })

  return { subject, html, text }
}
