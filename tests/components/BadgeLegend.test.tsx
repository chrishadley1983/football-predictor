// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BadgeLegend } from '@/components/leaderboard/BadgeLegend'

describe('<BadgeLegend>', () => {
  it('renders nothing when no badges were earned', () => {
    const { container } = render(<BadgeLegend earnedBadgeTypes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the collapsible guide and reveals earned badges on click', async () => {
    render(<BadgeLegend earnedBadgeTypes={['crystal_ball', 'hot_streak']} />)
    expect(screen.getByText('Badge Guide')).toBeInTheDocument()
    // collapsed initially
    expect(screen.queryByText('Crystal Ball')).toBeNull()

    await userEvent.click(screen.getByText('Badge Guide'))

    expect(screen.getByText('Crystal Ball')).toBeInTheDocument()
    expect(screen.getByText('Hot Streak')).toBeInTheDocument()
    // a non-earned badge is not listed
    expect(screen.queryByText('Contrarian')).toBeNull()
  })

  it('shows the full legend when no filter is provided', async () => {
    render(<BadgeLegend />)
    await userEvent.click(screen.getByText('Badge Guide'))
    expect(screen.getByText('Perfect Group')).toBeInTheDocument()
    expect(screen.getByText('Contrarian')).toBeInTheDocument()
  })
})
