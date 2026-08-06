import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:border-ring active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:brightness-110 hover:shadow-md',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:brightness-110 focus-visible:ring-destructive/30',
        outline:
          'border border-border bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-ring/40',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground',
        ghost:
          'text-foreground hover:bg-accent hover:text-accent-foreground',
        link:
          'text-primary underline-offset-4 hover:underline',
        // Brand gradient — reserved for the single primary action on a page so it
        // stays a signal rather than decoration.
        brand:
          'text-white shadow-md bg-[linear-gradient(110deg,var(--color-primary-600),var(--color-primary-500)_45%,var(--color-accent-500))] bg-[length:200%_100%] hover:bg-right transition-[background-position,box-shadow] duration-500 hover:shadow-lg',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 text-xs has-[>svg]:px-2.5',
        lg: 'h-11 rounded-lg px-6 text-base has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

/**
 * `asChild` renders the caller's child element with these styles instead of a <button>,
 * which is how a react-router <Link> becomes a button without nesting an <a> inside a
 * <button> (invalid HTML, and it breaks keyboard activation).
 */
const Button = React.forwardRef(function Button(
  { className, variant, size, asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp ref={ref} data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
});

export { Button, buttonVariants };
