import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  header?: ReactNode
  footer?: ReactNode
}

export function Card({ children, className, header, footer }: CardProps) {
  return (
    <div className={cn('rounded-xl border border-border-custom bg-surface shadow-lg shadow-black/20', className)}>
      {header && (
        <div className="border-b border-border-custom px-4 py-3">
          {header}
        </div>
      )}
      <div className="px-4 py-4">{children}</div>
      {footer && (
        <div className="border-t border-border-custom px-4 py-3">
          {footer}
        </div>
      )}
    </div>
  )
}
