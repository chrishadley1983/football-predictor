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
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
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
