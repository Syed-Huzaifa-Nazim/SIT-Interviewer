import * as React from 'react';
import { ResponsiveContainer, Tooltip as RechartsTooltip, Legend as RechartsLegend } from 'recharts';
import { cn } from '@/lib/utils';

/**
 * Chart shell for the Admin Hub and candidate reports.
 *
 * Built on the recharts already in the project rather than a second charting library.
 * The value it adds over calling recharts directly is a single `config` object that maps
 * every data key to a label and colour once, so the tooltip, legend and series can never
 * drift out of sync — which is the usual way a chart ends up with a green bar labelled
 * in the legend as blue.
 *
 * Colours come from the --chart-1..5 tokens, so charts follow the light/dark theme
 * automatically instead of hard-coding hex values per page.
 */

const ChartContext = React.createContext(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error('useChart must be used inside a <ChartContainer />');
  return ctx;
}

/**
 * @param {object} config  { dataKey: { label: string, color?: string, icon?: Component } }
 */
function ChartContainer({ id, className, children, config = {}, ...props }) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        data-slot="chart"
        className={cn(
          "flex aspect-video justify-center text-xs",
          // Tame recharts' default SVG chrome so charts sit calmly inside cards.
          '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground',
          '[&_.recharts-cartesian-grid_line]:stroke-border/60',
          '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border',
          '[&_.recharts-polar-grid_[stroke="#ccc"]]:stroke-border',
          '[&_.recharts-radial-bar-background-sector]:fill-muted',
          '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/60',
          '[&_.recharts-reference-line_[stroke="#ccc"]]:stroke-border',
          '[&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none',
          '[&_.recharts-layer]:outline-none',
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/** Emits `--color-<key>` custom properties scoped to this chart instance, so a series can
 *  reference `var(--color-score)` and stay in sync with the config in one place. */
function ChartStyle({ id, config }) {
  const entries = Object.entries(config).filter(([, v]) => v && v.color);
  if (!entries.length) return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] { ${entries.map(([k, v]) => `--color-${k}: ${v.color};`).join(' ')} }`,
      }}
    />
  );
}

const ChartTooltip = RechartsTooltip;

function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  formatter,
  hideLabel = false,
  hideIndicator = false,
  indicator = 'dot',
  className,
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;

  const resolvedLabel = labelFormatter ? labelFormatter(label, payload) : label;

  return (
    <div
      className={cn(
        'border-border/60 bg-popover text-popover-foreground grid min-w-[9rem] items-start gap-1.5 rounded-lg border px-2.5 py-2 text-xs shadow-xl',
        className
      )}
    >
      {!hideLabel && resolvedLabel != null && <div className="font-semibold">{resolvedLabel}</div>}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = item.dataKey || item.name;
          const itemConfig = config[key] || {};
          const color = item.payload?.fill || item.color || itemConfig.color;
          return (
            <div key={`${key}-${index}`} className="flex w-full items-center gap-2">
              {!hideIndicator && (
                <span
                  className={cn(
                    'shrink-0 rounded-[2px]',
                    indicator === 'dot' ? 'size-2.5 rounded-full' : 'w-1 h-3.5'
                  )}
                  style={{ backgroundColor: color }}
                />
              )}
              <span className="text-muted-foreground">{itemConfig.label || item.name}</span>
              <span className="text-foreground ml-auto font-mono font-semibold tabular-nums">
                {formatter ? formatter(item.value, item.name, item) : item.value?.toLocaleString?.() ?? item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsLegend;

function ChartLegendContent({ payload, className, hideIcon = false }) {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-3', className)}>
      {payload.map((item) => {
        const key = item.dataKey || item.value;
        const itemConfig = config[key] || {};
        return (
          <div key={String(key)} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {!hideIcon && <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
            {itemConfig.label || item.value}
          </div>
        );
      })}
    </div>
  );
}

/** The token-backed palette, in the order charts should consume it. */
const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

/** Score -> semantic colour, shared by every score display so a 45 is never green
 *  in one place and amber in another. */
function scoreColor(score) {
  if (score === null || score === undefined) return 'var(--color-muted-foreground)';
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#0d6db7';
  if (score >= 40) return '#d97706';
  return '#dc2626';
}

export {
  ChartContainer,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  CHART_COLORS,
  scoreColor,
  useChart,
};
