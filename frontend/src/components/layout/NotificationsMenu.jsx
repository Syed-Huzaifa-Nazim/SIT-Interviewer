import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { timeAgo, formatDateTime } from '../../utils/datetime';
import {
  Bell,
  BellOff,
  CheckCheck,
  ClipboardCheck,
  Coins,
  FileText,
  Info,
  ChevronRight,
} from 'lucide-react';

/**
 * The bell menu in the candidate header.
 *
 * Notifications used to be inert: a title, a message, and a bare date, inside a div you
 * could not click. "Interview Evaluation Ready!" told a candidate their report existed and
 * then left them to go find it. Each row is now a button that navigates — to the exact
 * target the backend stored on the notification (`link`), or failing that to the section its
 * `type` belongs to.
 */

// Per-type presentation and the fallback destination for notifications with no stored link
// — every row before the `link` column existed, plus anything purely informational.
const TYPE_META = {
  interview: { icon: ClipboardCheck, route: '/history', tone: 'text-primary-500 bg-primary-500/10' },
  token: { icon: Coins, route: '/profile', tone: 'text-amber-500 bg-amber-500/10' },
  recommendation: { icon: FileText, route: '/resume-match', tone: 'text-emerald-500 bg-emerald-500/10' },
  activity: { icon: Info, route: null, tone: 'text-slate-500 bg-slate-500/10' },
};

const metaFor = (type) => TYPE_META[type] || TYPE_META.activity;

/**
 * Only ever navigate to an in-app path.
 *
 * `link` is a plain string column, so treating it as trusted would make any write to that
 * column an open redirect. A leading "//" is protocol-relative — "//evil.example" is an
 * absolute URL to another host despite starting with a slash — so it has to be rejected
 * alongside anything carrying a scheme.
 */
const safeRoute = (link) => {
  if (typeof link !== 'string') return null;
  const trimmed = link.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  return trimmed;
};

const destinationOf = (notif) => safeRoute(notif.link) || metaFor(notif.type).route;

const NotificationRow = memo(({ notif, onNavigate }) => {
  const meta = metaFor(notif.type);
  const Icon = meta.icon;
  const to = destinationOf(notif);
  const unread = !notif.is_read;

  const body = (
    <>
      <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${meta.tone}`}>
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800 dark:text-slate-100">
            {notif.title}
          </span>
          <time
            className="shrink-0 text-[10px] tabular-nums text-slate-400"
            dateTime={notif.created_at}
            title={formatDateTime(notif.created_at)}
          >
            {timeAgo(notif.created_at)}
          </time>
        </span>
        <span className="mt-0.5 block line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {notif.message}
        </span>
      </span>
      {to && (
        <ChevronRight size={14} className="mt-1 shrink-0 self-start text-slate-300 dark:text-slate-600" />
      )}
    </>
  );

  const shared = `flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors ${
    unread ? 'bg-primary-500/[0.06]' : ''
  }`;

  // A notification with nowhere to go renders as plain content rather than a dead button —
  // a control that looks clickable and does nothing is worse than one that doesn't.
  if (!to) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <button type="button" onClick={() => onNavigate(to)} className={`${shared} hover:bg-slate-100 dark:hover:bg-slate-900/60`}>
      {body}
    </button>
  );
});
NotificationRow.displayName = 'NotificationRow';

const NotificationsMenu = ({ notifications, onMarkAllRead }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const unreadCount = useMemo(
    () => notifications.reduce((n, x) => (x.is_read ? n : n + 1), 0),
    [notifications]
  );

  // Close on outside click and on Escape. The old dropdown had neither, so it stayed open
  // until the bell was clicked again — including while the candidate worked behind it.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleNavigate = useCallback(
    (to) => {
      setOpen(false);
      navigate(to);
    },
    [navigate]
  );

  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={toggle}
        className="relative rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold tabular-nums text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[21rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 animate-slide-up"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2.5 dark:border-slate-800">
            <h5 className="text-sm font-bold text-slate-800 dark:text-white">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 text-[11px] font-semibold text-primary-500">{unreadCount} new</span>
              )}
            </h5>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 transition-colors hover:text-primary-500"
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/70">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <BellOff size={22} className="text-slate-300 dark:text-slate-700" />
                <p className="text-xs text-slate-500 dark:text-slate-400">You're all caught up.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationRow key={n.id} notif={n} onNavigate={handleNavigate} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsMenu;
