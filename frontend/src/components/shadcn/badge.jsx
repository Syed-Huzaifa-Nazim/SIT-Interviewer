import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        warning: 'border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400',
        destructive: 'border-transparent bg-red-500/10 text-red-600 dark:text-red-400',
        info: 'border-transparent bg-sky-500/10 text-sky-600 dark:text-sky-400',
        outline: 'border-border text-foreground',
        // Solid variants for when a badge must survive on a coloured/!white surface.
        solid: 'border-transparent bg-primary text-primary-foreground',
      },
      size: {
        default: 'px-2 py-0.5 text-xs',
        sm: 'px-1.5 py-0 text-[10px]',
        lg: 'px-2.5 py-1 text-sm',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

function Badge({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? Slot : 'span';
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

/**
 * A badge with a soft pulsing dot — for genuinely live state (an in-progress interview,
 * an online candidate). Kept separate from Badge so the animation is opt-in and never
 * ends up decorating static labels.
 */
function StatusBadge({ className, variant = 'default', pulse = false, children, ...props }) {
  const dotColor = {
    default: 'bg-primary',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    destructive: 'bg-red-500',
    info: 'bg-sky-500',
    secondary: 'bg-muted-foreground',
    outline: 'bg-muted-foreground',
    solid: 'bg-primary-foreground',
  }[variant];

  return (
    <Badge variant={variant} className={cn('gap-1.5', className)} {...props}>
      <span className="relative flex size-1.5">
        {pulse && (
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', dotColor)} />
        )}
        <span className={cn('relative inline-flex size-1.5 rounded-full', dotColor)} />
      </span>
      {children}
    </Badge>
  );
}

export { Badge, StatusBadge, badgeVariants };
