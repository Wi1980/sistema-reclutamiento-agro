import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        // Azul marino — brand primary (navegar, acciones)
        default:   'bg-agro-100 text-agro-800',
        // Teal — positivo, confirmado
        forest:    'bg-teal-100 text-teal-800',
        // Navy suave — acento marca
        lime:      'bg-agro-100 text-agro-700',
        // Neutro
        secondary: 'bg-stone-100 text-stone-700',
        // Estados operativos
        success:   'bg-teal-100 text-teal-700',
        warning:   'bg-earth-100 text-earth-800',
        danger:    'bg-red-100 text-red-700',
        info:      'bg-agro-50 text-agro-700',
        purple:    'bg-purple-100 text-purple-700',
        outline:   'border border-stone-200 text-stone-700',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
