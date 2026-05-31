// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge, TournamentStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge'

describe('<Badge>', () => {
  it('renders its content', () => {
    render(<Badge>Hello</Badge>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('maps tournament statuses to friendly labels', () => {
    const { rerender } = render(<TournamentStatusBadge status="group_stage_open" />)
    expect(screen.getByText('Groups Open')).toBeInTheDocument()
    rerender(<TournamentStatusBadge status="knockout_closed" />)
    expect(screen.getByText('Knockout Closed')).toBeInTheDocument()
    rerender(<TournamentStatusBadge status="completed" />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('capitalises payment statuses', () => {
    const { rerender } = render(<PaymentStatusBadge status="paid" />)
    expect(screen.getByText('Paid')).toBeInTheDocument()
    rerender(<PaymentStatusBadge status="refunded" />)
    expect(screen.getByText('Refunded')).toBeInTheDocument()
  })
})
