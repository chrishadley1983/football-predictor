'use client'

import { cn } from '@/lib/utils'

interface PlayerAvatarProps {
  avatarUrl: string | null | undefined
  displayName: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-16 w-16 text-xl',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function PlayerAvatar({ avatarUrl, displayName, size = 'md', className }: PlayerAvatarProps) {
  const sizeClass = sizeClasses[size]

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={displayName}
        className={cn('rounded-full object-cover', sizeClass, className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-gold font-bold text-black',
        sizeClass,
        className
      )}
    >
      {getInitials(displayName)}
    </div>
  )
}
