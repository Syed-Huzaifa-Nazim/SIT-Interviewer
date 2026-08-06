import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ Tooltip */

const TooltipProvider = ({ delayDuration = 200, ...props }) => (
  <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
);
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({ className, sideOffset = 6, children, ...props }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-fit max-w-xs rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-slate-50 shadow-md dark:bg-slate-700',
          'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-slate-900 dark:fill-slate-700" width={10} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/**
 * Convenience wrapper — the 4-component Radix dance for a one-line hint is noise at the
 * call site when every tooltip in the admin portal looks the same.
 *
 * It carries its OWN provider. Radix throws "`Tooltip` must be used within
 * `TooltipProvider`" if one is missing, which turns a forgotten ancestor into a blank
 * page rather than a missing tooltip — far too harsh a failure for a hover hint. Nesting
 * providers is supported and costs only a context lookup, so the component is made
 * impossible to misuse instead of relying on every caller remembering. Wrap a subtree in
 * `TooltipProvider` explicitly only when you want shared open/skip timing across it.
 */
function Tooltip({ content, children, side = 'top', delayDuration = 200, ...props }) {
  if (!content) return children;
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <TooltipRoot {...props}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}

/* ---------------------------------------------------------------- Separator */

function Separator({ className, orientation = 'horizontal', decorative = true, ...props }) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'bg-border shrink-0',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------- Avatar */

function Avatar({ className, ...props }) {
  return (
    <AvatarPrimitive.Root
      className={cn('relative flex size-9 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }) {
  return <AvatarPrimitive.Image className={cn('aspect-square size-full object-cover', className)} {...props} />;
}

function AvatarFallback({ className, ...props }) {
  return (
    <AvatarPrimitive.Fallback
      className={cn('bg-primary/10 text-primary flex size-full items-center justify-center rounded-full text-xs font-bold', className)}
      {...props}
    />
  );
}

/** Deterministic initials so the same candidate always gets the same fallback. */
function initialsOf(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ----------------------------------------------------------------- Progress */

function Progress({ className, value = 0, indicatorClassName, ...props }) {
  return (
    <ProgressPrimitive.Root
      className={cn('bg-muted relative h-2 w-full overflow-hidden rounded-full', className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn('bg-primary h-full w-full flex-1 rounded-full transition-transform duration-700 ease-out', indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

/* ----------------------------------------------------------------- Skeleton */

/**
 * Loading placeholder with a travelling sheen rather than a plain opacity pulse — it
 * reads as "content is coming" instead of "something is broken". The sheen is a child
 * element so the base block keeps its own background colour.
 */
function Skeleton({ className, ...props }) {
  return (
    <div className={cn('bg-muted relative overflow-hidden rounded-md', className)} {...props}>
      <div className="absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)] animate-[admin-shimmer_1.6s_infinite]" />
    </div>
  );
}

/** Table-shaped skeleton so a loading list keeps the page height stable. */
function SkeletonTable({ rows = 6, cols = 5, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-11', c === 0 ? 'w-[22%]' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
  Tooltip,
  Separator,
  Avatar,
  AvatarImage,
  AvatarFallback,
  initialsOf,
  Progress,
  Skeleton,
  SkeletonTable,
};
