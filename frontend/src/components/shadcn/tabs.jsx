import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-1', className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer",
        'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        'focus-visible:ring-[3px] focus-visible:ring-ring/40 outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />;
}

/**
 * Underline-style tab bar with a shared layout indicator: the underline animates
 * between tabs instead of cutting, using motion's layoutId so the movement is a single
 * continuous element rather than two fades. `groupId` must be unique per tab bar on the
 * page, otherwise two bars would try to share one indicator and it would fly between them.
 */
function UnderlineTabs({ tabs, value, onValueChange, groupId = 'tabs', className }) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-border overflow-x-auto', className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onValueChange(tab.value)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer outline-none',
              'focus-visible:ring-[3px] focus-visible:ring-ring/40 rounded-t-md',
              active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                  {tab.count}
                </span>
              )}
            </span>
            {active && (
              <motion.span
                layoutId={`${groupId}-underline`}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, UnderlineTabs };
