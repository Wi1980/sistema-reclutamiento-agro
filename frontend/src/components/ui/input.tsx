import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-xl border bg-white px-3 py-1.5 text-sm text-stone-800 placeholder:text-stone-400',
        'transition-all duration-150 outline-none',
        'focus:ring-2 focus:ring-agro-400 focus:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error
          ? 'border-red-400 focus:ring-red-300'
          : 'border-stone-200 hover:border-stone-300',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
