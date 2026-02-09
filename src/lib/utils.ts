import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount)
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  })
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
}

/** Strip markdown formatting to produce plain text for previews */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')       // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/__(.+?)__/g, '$1')        // bold alt
    .replace(/_(.+?)_/g, '$1')          // italic alt
    .replace(/~~(.+?)~~/g, '$1')        // strikethrough
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // images
    .replace(/`{1,3}[^`]*`{1,3}/g, '')  // inline code
    .replace(/^[-*+]\s+/gm, '')         // unordered list markers
    .replace(/^\d+\.\s+/gm, '')         // ordered list markers
    .replace(/^>\s+/gm, '')             // blockquotes
    .replace(/\n{2,}/g, ' ')            // collapse multiple newlines
    .replace(/\n/g, ' ')                // remaining newlines
    .trim()
}

/** Truncate text at a word boundary */
export function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const truncated = text.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated) + '...'
}

export function getDeadlineStatus(deadline: string | Date | null): {
  passed: boolean
  label: string
} {
  if (!deadline) {
    return { passed: false, label: 'No deadline set' }
  }
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline
  const now = new Date()
  if (now >= d) {
    return { passed: true, label: 'Deadline passed' }
  }
  const diff = d.getTime() - now.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  if (days > 0) {
    return { passed: false, label: `${days} day${days === 1 ? '' : 's'} remaining` }
  }
  if (hours > 0) {
    return { passed: false, label: `${hours} hour${hours === 1 ? '' : 's'} remaining` }
  }
  const minutes = Math.floor(diff / (1000 * 60))
  return { passed: false, label: `${minutes} minute${minutes === 1 ? '' : 's'} remaining` }
}
