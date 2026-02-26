'use client'

import { usePathname } from 'next/navigation'
import { PunditBubble } from './PunditBubble'

interface PunditBubbleWrapperProps {
  tournamentSlug: string
}

/**
 * Renders PunditBubble on all tournament sub-pages EXCEPT the hub page
 * (where PunditCard is used instead).
 */
export function PunditBubbleWrapper({ tournamentSlug }: PunditBubbleWrapperProps) {
  const pathname = usePathname()

  // Don't show bubble on the hub page — PunditCard is shown there instead
  const isHubPage = pathname === `/tournament/${tournamentSlug}`

  if (isHubPage) return null

  return <PunditBubble tournamentSlug={tournamentSlug} />
}
