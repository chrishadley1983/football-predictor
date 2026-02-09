import { cn } from '@/lib/utils'
import type { TournamentStatus, PaymentStatus } from '@/lib/types'

type BadgeVariant = 'green' | 'yellow' | 'red' | 'gray' | 'blue' | 'purple' | 'gold'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  green: 'bg-green-accent/20 text-green-accent',
  yellow: 'bg-yellow-accent/20 text-yellow-accent',
  red: 'bg-red-accent/20 text-red-accent',
  gray: 'bg-surface-light text-text-secondary',
  blue: 'bg-blue-500/20 text-blue-400',
  purple: 'bg-purple-500/20 text-purple-400',
  gold: 'bg-gold/20 text-gold',
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
