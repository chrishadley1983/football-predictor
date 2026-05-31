// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'

describe('<PlayerAvatar>', () => {
  it('renders an <img> with the avatar URL and the name as alt text', () => {
    render(<PlayerAvatar avatarUrl="https://cdn.example/a.png" displayName="Ada Lovelace" />)
    const img = screen.getByRole('img', { name: 'Ada Lovelace' }) as HTMLImageElement
    expect(img.src).toContain('https://cdn.example/a.png')
  })

  it('falls back to initials when there is no avatar URL', () => {
    render(<PlayerAvatar avatarUrl={null} displayName="Zoe" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('Z')).toBeInTheDocument()
  })
})
