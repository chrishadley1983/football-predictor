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
    <div className={cn('rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900', className)}>
      {header && (
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          {header}
        </div>
      )}
      <div className="px-4 py-4">{children}</div>
      {footer && (
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          {footer}
        </div>
      )}
    </div>
  )
}
