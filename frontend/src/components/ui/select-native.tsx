import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface SelectNativeProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const SelectNative = React.forwardRef<HTMLSelectElement, SelectNativeProps>(
  ({ className, error, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex h-9 w-full appearance-none rounded-xl border bg-white px-3 py-1.5 pr-9 text-sm text-stone-800',
          'transition-all duration-150 outline-none cursor-pointer',
          'focus:ring-2 focus:ring-agro-400 focus:border-transparent',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-stone-50',
          error
            ? 'border-red-400 focus:ring-red-300'
            : 'border-stone-200 hover:border-stone-300',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
    </div>
  )
);
SelectNative.displayName = 'SelectNative';

export { SelectNative };
