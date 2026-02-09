import { cn } from '@/lib/utils'
import type { TournamentStatus, PaymentStatus } from '@/lib/types'

type BadgeVariant = 'green' | 'yellow' | 'red' | 'gray' | 'blue' | 'purple'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
}

export function Badge({ children, variant = 'gray', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

const tournamentStatusVariant: Record<TournamentStatus, BadgeVariant> = {
  draft: 'gray',
  group_stage_open: 'green',
  group_stage_closed: 'yellow',
  knockout_open: 'blue',
  knockout_closed: 'purple',
  completed: 'red',
}

const tournamentStatusLabel: Record<TournamentStatus, string> = {
  draft: 'Draft',
  group_stage_open: 'Groups Open',
  group_stage_closed: 'Groups Closed',
  knockout_open: 'Knockout Open',
  knockout_closed: 'Knockout Closed',
  completed: 'Completed',
}

export function TournamentStatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <Badge variant={tournamentStatusVariant[status]}>
      {tournamentStatusLabel[status]}
    </Badge>
  )
}

const paymentStatusVariant: Record<PaymentStatus, BadgeVariant> = {
  pending: 'yellow',
  paid: 'green',
  refunded: 'red',
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant={paymentStatusVariant[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}
