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
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'block w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-offset-1',
            'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50',
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-green-500 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }
export type { InputProps }
