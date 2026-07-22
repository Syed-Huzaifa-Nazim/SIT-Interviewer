import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Compact table pagination control. Shows a "start–end of total" summary and
 * Prev / page-number / Next buttons. Renders nothing when everything fits on one page.
 *
 * Props:
 *  - page       current 1-based page
 *  - pageSize   rows per page (default 10)
 *  - total      total number of rows across all pages
 *  - onChange   (nextPage) => void
 */
const Pagination = ({ page, pageSize = 10, total = 0, onChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Self-correct an out-of-range page (e.g. the current page emptied out after rows were
  // deleted/filtered). Runs even when the control itself is hidden below, so a parent that
  // slices by `page` never gets stuck showing an empty page.
  useEffect(() => {
    if (page > totalPages) onChange?.(totalPages);
    else if (page < 1) onChange?.(1);
  }, [page, totalPages, onChange]);

  if (total <= pageSize) return null;

  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  // Build a small window of page numbers around the current page (with ellipses).
  const pages = [];
  const push = (p) => pages.push(p);
  push(1);
  const from = Math.max(2, current - 1);
  const to = Math.min(totalPages - 1, current + 1);
  if (from > 2) push('…');
  for (let p = from; p <= to; p += 1) push(p);
  if (to < totalPages - 1) push('…');
  if (totalPages > 1) push(totalPages);

  const go = (p) => {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== current) onChange?.(next);
  };

  const btnBase =
    'inline-flex items-center justify-center h-8 min-w-8 px-2 rounded-lg text-xs font-bold transition select-none';
  const inactive =
    'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent';
  const active = 'bg-primary-600 text-white shadow-sm';

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
        Showing <b className="text-slate-700 dark:text-slate-200">{start}</b>–
        <b className="text-slate-700 dark:text-slate-200">{end}</b> of{' '}
        <b className="text-slate-700 dark:text-slate-200">{total}</b>
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`${btnBase} ${inactive}`}
          onClick={() => go(current - 1)}
          disabled={current === 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        {pages.map((p, idx) =>
          p === '…' ? (
            <span key={`e${idx}`} className="px-1 text-xs text-slate-400 dark:text-slate-600">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`${btnBase} ${p === current ? active : inactive}`}
              onClick={() => go(p)}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          className={`${btnBase} ${inactive}`}
          onClick={() => go(current + 1)}
          disabled={current === totalPages}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
