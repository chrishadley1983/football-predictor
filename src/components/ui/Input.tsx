'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'block w-full rounded-md border bg-surface-light px-3 py-2 text-sm text-foreground shadow-sm transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-border-custom focus:border-gold focus:ring-gold',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-accent">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }
export type { InputProps }
