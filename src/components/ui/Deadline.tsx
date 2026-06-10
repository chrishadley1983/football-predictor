'use client'

import { useEffect, useState } from 'react'
import { getDeadlineStatus } from '@/lib/utils'

const LOCAL_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
}

/**
 * Absolute deadline rendered in the viewer's own timezone and locale.
 * Deadlines are stored as UTC instants; the server (and no-JS) fallback is
 * UK time, then after mount the browser re-renders in the viewer's own
 * timezone with an abbreviation (e.g. "11 Jun 2026, 11:00 EDT") so overseas
 * players see a time that matches the countdown.
 */
export function DeadlineLocalTime({
  deadline,
  options,
}: {
  deadline: string | Date
  options?: Intl.DateTimeFormatOptions
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const d = typeof deadline === 'string' ? new Date(deadline) : deadline
  const opts = { ...LOCAL_TIME_OPTIONS, ...options }
  const formatted = mounted
    ? d.toLocaleString(undefined, opts)
    : d.toLocaleString('en-GB', { ...opts, timeZone: 'Europe/London' })

  return <span suppressHydrationWarning>{formatted}</span>
}

/**
 * Live "X hours remaining" countdown. Re-evaluated every 30 seconds so the
 * label (and the open/passed flip) doesn't freeze at server render time.
 * With `showTime`, appends the absolute deadline in the viewer's timezone.
 */
export function DeadlineCountdown({
  deadline,
  closedLabel = 'Deadline passed',
  showTime = false,
  timeOptions,
}: {
  deadline: string | null
  closedLabel?: string
  showTime?: boolean
  timeOptions?: Intl.DateTimeFormatOptions
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const status = getDeadlineStatus(deadline)
  if (status.passed) {
    return <span suppressHydrationWarning>{closedLabel}</span>
  }
  return (
    <span suppressHydrationWarning>
      {status.label}
      {showTime && deadline && (
        <span className="ml-1">
          (<DeadlineLocalTime deadline={deadline} options={timeOptions} />)
        </span>
      )}
    </span>
  )
}
