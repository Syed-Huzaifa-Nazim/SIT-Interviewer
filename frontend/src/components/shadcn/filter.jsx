import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Filter, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * Excel-style filter control: one small funnel button that sits beside a search field
 * and opens a checklist of every facet for that page.
 *
 * Each page describes its own facets as data (`groups`), and the component owns the
 * popover, the counts, the active-filter badge and the clearing. Pages differ in what
 * they can be filtered by, but they should not each grow their own filter UI.
 *
 * Selection is a plain object of `{ [groupKey]: string[] }`, so a page can keep it in
 * URL params (shareable, survives a refresh) or in local state without this component
 * caring which.
 *
 * @param {Array}  groups   [{ key, label, options: [{ value, label, count }] }]
 * @param {object} value    { [groupKey]: string[] }
 * @param {func}   onChange (nextValue) => void
 */
function AdminFilter({ groups = [], value = {}, onChange, align = 'end', className }) {
  const [open, setOpen] = React.useState(false);

  const activeCount = React.useMemo(
    () => Object.values(value).reduce((sum, list) => sum + (list?.length || 0), 0),
    [value]
  );

  const usableGroups = groups.filter((g) => g && g.options && g.options.length > 0);

  const toggle = (groupKey, optionValue) => {
    const current = value[groupKey] || [];
    const next = current.includes(optionValue)
      ? current.filter((v) => v !== optionValue)
      : [...current, optionValue];
    onChange({ ...value, [groupKey]: next });
  };

  const clearGroup = (groupKey) => onChange({ ...value, [groupKey]: [] });

  const selectAllInGroup = (group) =>
    onChange({ ...value, [group.key]: group.options.map((o) => o.value) });

  const clearAll = () => {
    const cleared = {};
    usableGroups.forEach((g) => {
      cleared[g.key] = [];
    });
    onChange({ ...value, ...cleared });
  };

  // Flat list of everything currently applied, so the popover can lead with what is ON
  // rather than making you open each group to find out. Each chip removes just itself.
  const activeChips = React.useMemo(
    () =>
      usableGroups.flatMap((group) =>
        (value[group.key] || []).map((v) => ({
          groupKey: group.key,
          groupLabel: group.label,
          value: v,
          label: group.options.find((o) => o.value === v)?.label ?? v,
        }))
      ),
    [usableGroups, value]
  );

  if (!usableGroups.length) return null;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
          title="Filter"
          className={cn(
            'relative inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors outline-none',
            'focus-visible:ring-[3px] focus-visible:ring-ring/40',
            activeCount > 0
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-input bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            className
          )}
        >
          <Filter className={cn('size-4', activeCount > 0 && 'fill-current')} />
          {activeCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={8}
          className={cn(
            'z-50 w-72 rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2'
          )}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
            <span className="flex items-baseline gap-1.5">
              <span className="text-xs font-bold text-foreground">Filters</span>
              {activeCount > 0 && (
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {activeCount} applied
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              {activeCount > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
                  Clear all
                </Button>
              )}
              <PopoverPrimitive.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close filters">
                  <X className="size-3.5" />
                </Button>
              </PopoverPrimitive.Close>
            </div>
          </header>

          {/* What is currently applied, before the full checklists. Reading the active set
              used to mean opening every group in turn. */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-border bg-muted/40 px-2.5 py-2">
              {activeChips.map((chip) => (
                <button
                  key={`${chip.groupKey}:${chip.value}`}
                  type="button"
                  onClick={() => toggle(chip.groupKey, chip.value)}
                  // Named by its group too: several facets can offer the same label, and a
                  // row of chips all announcing just "active" is unusable on a screen reader.
                  aria-label={`Remove ${chip.groupLabel}: ${chip.label}`}
                  title={`Remove ${chip.groupLabel}: ${chip.label}`}
                  className="group inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-primary/30 bg-primary/10 py-0.5 pl-1.5 pr-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  <span className="truncate">{chip.label}</span>
                  <X className="size-2.5 shrink-0 opacity-60 group-hover:opacity-100" strokeWidth={3} />
                </button>
              ))}
            </div>
          )}

          {/* Capped so a facet with many values scrolls inside the popover rather than
              growing it past the bottom of the window. */}
          <div className="max-h-[22rem] overflow-y-auto p-2">
            {usableGroups.map((group, gi) => {
              const selected = value[group.key] || [];
              return (
                <section key={group.key} className={cn(gi > 0 && 'mt-1 border-t border-border pt-2')}>
                  <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </span>
                      {selected.length > 0 && (
                        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-primary">
                          {selected.length}
                        </span>
                      )}
                    </span>
                    {/* All / Clear rather than only Clear: picking most of a long facet one
                        box at a time is the tedious case this removes. */}
                    <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold">
                      {selected.length < group.options.length && (
                        <button
                          type="button"
                          onClick={() => selectAllInGroup(group)}
                          className="cursor-pointer text-muted-foreground hover:text-foreground hover:underline"
                        >
                          All
                        </button>
                      )}
                      {selected.length > 0 && (
                        <button
                          type="button"
                          onClick={() => clearGroup(group.key)}
                          className="cursor-pointer text-primary hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </span>
                  </div>

                  {group.options.map((opt) => {
                    const checked = selected.includes(opt.value);
                    // An option matching nothing is dimmed rather than hidden: knowing a
                    // category exists but is currently empty is information, and hiding it
                    // would make the list shift around as the data changes.
                    const empty = opt.count === 0 && !checked;
                    return (
                        <label
                          key={opt.value}
                          className={cn(
                            'flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors',
                            checked ? 'bg-primary/8 hover:bg-primary/12' : 'hover:bg-accent',
                            empty && 'opacity-45'
                          )}
                        >
                          <span
                            className={cn(
                              'flex min-w-0 items-center gap-2.5 text-xs',
                              checked ? 'font-bold text-foreground' : 'font-medium text-foreground'
                            )}
                          >
                            <span
                              className={cn(
                                'grid size-4 shrink-0 place-items-center rounded-[5px] border transition-all',
                                checked ? 'border-primary bg-primary' : 'border-input bg-card'
                              )}
                            >
                              {checked && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(group.key, opt.value)}
                              className="sr-only"
                            />
                            <span className="truncate">{opt.label}</span>
                          </span>
                          {opt.count !== undefined && (
                            <span
                              className={cn(
                                'shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums',
                                checked ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
                              )}
                            >
                              {opt.count}
                            </span>
                          )}
                        </label>
                      );
                  })}
                </section>
              );
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * Build a facet's options from a list, counting how many rows carry each value.
 * Counts are what make the control readable — "Banned 4" tells you whether a filter is
 * worth applying before you apply it.
 *
 * @param {Array}  rows
 * @param {func}   accessor  row => value (or array of values)
 * @param {object} opts      { labels: {value:label}, order: [values], includeEmpty: bool }
 */
function facetOptions(rows, accessor, { labels = {}, order, includeEmpty = false } = {}) {
  const counts = new Map();
  rows.forEach((row) => {
    const raw = accessor(row);
    const values = Array.isArray(raw) ? raw : [raw];
    values.forEach((v) => {
      if (v === null || v === undefined || v === '') {
        if (!includeEmpty) return;
        counts.set('—', (counts.get('—') || 0) + 1);
        return;
      }
      const key = String(v);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  let keys = Array.from(counts.keys());
  if (order) {
    // Keep a caller-defined order (status pipelines read wrong alphabetised), then append
    // anything unexpected the data actually contained.
    const known = order.filter((k) => counts.has(k));
    const rest = keys.filter((k) => !order.includes(k)).sort();
    keys = [...known, ...rest];
  } else {
    keys.sort();
  }

  return keys.map((key) => ({
    value: key,
    label: labels[key] || key,
    count: counts.get(key),
  }));
}

/** True when any facet in the selection has at least one value chosen. */
function hasActiveFilters(value = {}) {
  return Object.values(value).some((list) => (list?.length || 0) > 0);
}

/** Keep only rows matching every active facet. `accessors` maps groupKey -> row => value. */
function applyFacets(rows, value = {}, accessors = {}) {
  const active = Object.entries(value).filter(([, list]) => list && list.length > 0);
  if (!active.length) return rows;
  return rows.filter((row) =>
    active.every(([key, list]) => {
      const accessor = accessors[key];
      if (!accessor) return true;
      const raw = accessor(row);
      const values = (Array.isArray(raw) ? raw : [raw]).map((v) =>
        v === null || v === undefined || v === '' ? '—' : String(v)
      );
      return values.some((v) => list.includes(v));
    })
  );
}

export { AdminFilter, facetOptions, hasActiveFilters, applyFacets };
