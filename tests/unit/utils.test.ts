import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  cn,
  formatCurrency,
  formatDate,
  slugify,
  stripMarkdown,
  truncateAtWord,
  getDeadlineStatus,
} from '@/lib/utils'

describe('cn (class merge)', () => {
  it('joins truthy classes and drops falsy ones', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c')
  })
  it('lets later tailwind classes win conflicts', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})

describe('formatCurrency', () => {
  it('formats GBP with the £ symbol', () => {
    expect(formatCurrency(10)).toBe('£10.00')
    expect(formatCurrency(1234.5)).toBe('£1,234.50')
  })
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('£0.00')
  })
})

describe('formatDate', () => {
  it('formats an ISO string as en-GB long date', () => {
    expect(formatDate('2026-06-11')).toBe('11 June 2026')
  })
  it('accepts a Date object', () => {
    expect(formatDate(new Date('2026-12-18T00:00:00Z'))).toBe('18 December 2026')
  })
  it('honours overriding options', () => {
    expect(formatDate('2026-06-11', { month: 'short', day: undefined, year: undefined })).toBe('Jun')
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('World Cup 2026')).toBe('world-cup-2026')
  })
  it('strips punctuation', () => {
    expect(slugify('Group A: Final!')).toBe('group-a-final')
  })
  it('collapses repeated separators and trims', () => {
    expect(slugify('  Hello   --  World  ')).toBe('hello-world')
  })
  it('handles already-clean input idempotently', () => {
    expect(slugify('already-clean')).toBe('already-clean')
  })
})

describe('stripMarkdown', () => {
  it('removes headings, bold, italic', () => {
    expect(stripMarkdown('# Title\n**bold** and *italic*')).toBe('Title bold and italic')
  })
  it('keeps link text and drops images', () => {
    expect(stripMarkdown('See [the docs](https://x.com) ![alt](img.png)')).toBe('See the docs')
  })
  it('strips a standalone image entirely (L1 fix: image regex runs before links)', () => {
    expect(stripMarkdown('![alt](img.png)')).toBe('')
  })
  it('strips list markers, blockquotes and inline code', () => {
    expect(stripMarkdown('- item one\n> quote\n`code`')).toBe('item one quote')
  })
})

describe('truncateAtWord', () => {
  it('returns the text unchanged when within the limit', () => {
    expect(truncateAtWord('short', 20)).toBe('short')
  })
  it('truncates at a word boundary and appends an ellipsis', () => {
    const out = truncateAtWord('the quick brown fox jumps', 12)
    expect(out.endsWith('...')).toBe(true)
    expect(out).toBe('the quick...')
  })
  it('hard-truncates when no good word boundary exists', () => {
    // No space before 60% of maxLength -> slice mid-word
    const out = truncateAtWord('supercalifragilistic', 10)
    expect(out).toBe('supercalif...')
  })
})

describe('getDeadlineStatus', () => {
  afterEach(() => vi.useRealTimers())

  it('reports "no deadline" for null', () => {
    expect(getDeadlineStatus(null)).toEqual({ passed: false, label: 'No deadline set' })
  })

  it('marks a past deadline as passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    expect(getDeadlineStatus('2026-05-01T12:00:00Z')).toEqual({
      passed: true,
      label: 'Deadline passed',
    })
  })

  it('counts days remaining (plural/singular)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    expect(getDeadlineStatus('2026-06-04T12:00:00Z')).toEqual({
      passed: false,
      label: '3 days remaining',
    })
    expect(getDeadlineStatus('2026-06-02T13:00:00Z').label).toBe('1 day remaining')
  })

  it('counts hours remaining when under a day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    expect(getDeadlineStatus('2026-06-01T17:00:00Z').label).toBe('5 hours remaining')
    expect(getDeadlineStatus('2026-06-01T13:00:00Z').label).toBe('1 hour remaining')
  })

  it('counts minutes remaining when under an hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'))
    expect(getDeadlineStatus('2026-06-01T12:30:00Z').label).toBe('30 minutes remaining')
  })
})
