import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-agro-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        // Azul marino — acción primaria
        default:     'bg-agro-700 text-white shadow-sm hover:bg-agro-800',
        // Verde bosque — acción positiva / naturaleza
        forest:      'bg-forest-700 text-white shadow-sm hover:bg-forest-800',
        // Borde navy ligero — secundario
        secondary:   'bg-white text-agro-700 border border-agro-200 hover:bg-agro-50',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        outline:     'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50',
        ghost:       'hover:bg-stone-100 text-stone-700',
        link:        'text-agro-700 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-6 py-2',
        sm:      'h-9 px-4 text-xs',
        lg:      'h-12 px-8',
        icon:    'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = 'Button';

export { Button, buttonVariants };
