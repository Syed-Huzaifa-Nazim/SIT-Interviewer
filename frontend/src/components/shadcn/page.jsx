import * as React from 'react';
import { Search, X, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { Button } from './button';
import { Skeleton, SkeletonTable } from './misc';
import { AuroraBackdrop } from './motion';

/**
 * Shared furniture for the Admin Hub pages.
 *
 * These pieces exist so every section presents itself the same way — one header
 * treatment, one search affordance, one empty state, one loading shape. Without them
 * each page drifts into its own dialect of the same three widgets, which is what the
 * portal looked like before.
 */

function AdminPageHeader({ icon: Icon, title, subtitle, actions, children, className }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border bg-card p-5 lg:p-6',
        className
      )}
    >
      <AuroraBackdrop />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">
              {title}
            </h1>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="relative mt-4">{children}</div>}
    </div>
  );
}

/** Search field with a clear button. Controlled, so the caller owns the term. */
function AdminSearch({ value, onChange, placeholder = 'Search…', className, children }) {
  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center', className)}>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="h-10 pl-9 pr-9"
          aria-label={placeholder}
        />
        {value && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Clear search"
            onClick={() => onChange({ target: { value: '' } })}
            className="absolute right-1 top-1/2 -translate-y-1/2"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Empty state. `filtered` distinguishes "there is nothing here" from "your search
 * matched nothing" — the second needs a way back, the first does not.
 */
function AdminEmpty({ icon: Icon = Inbox, title, message, filtered = false, onClear, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-14 text-center', className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-muted">
        <Icon className="size-6 text-muted-foreground/60" />
      </span>
      <h3 className="mt-1 text-sm font-bold text-foreground">{title}</h3>
      {message && <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{message}</p>}
      {filtered && onClear && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onClear}>
          Clear search
        </Button>
      )}
    </div>
  );
}

/** Page-shaped loading placeholder: header block plus a table skeleton. */
function AdminPageSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="rounded-xl border border-border bg-card p-4">
        <SkeletonTable rows={rows} cols={cols} />
      </div>
    </div>
  );
}

/** Card wrapper for a table so every list page frames its data identically. */
function AdminTableCard({ className, children }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>{children}</div>
  );
}

export { AdminPageHeader, AdminSearch, AdminEmpty, AdminPageSkeleton, AdminTableCard };
