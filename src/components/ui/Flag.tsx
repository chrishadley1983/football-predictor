import { flagImageUrl } from '@/lib/flags'

interface FlagProps {
  emoji: string | null | undefined
  name?: string | null
  className?: string
}

// Renders a country flag as an image (flagcdn.com) derived from its emoji, so
// flags display consistently everywhere instead of relying on the OS emoji font
// (Windows browsers show regional-indicator flags as bare letter pairs).
export function Flag({ emoji, name, className }: FlagProps) {
  const url = flagImageUrl(emoji)
  if (!url) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name ? `${name} flag` : ''}
      className={className ?? 'inline-block h-3.5 w-[1.375rem] shrink-0 rounded-[2px] object-cover'}
      loading="lazy"
    />
  )
}
