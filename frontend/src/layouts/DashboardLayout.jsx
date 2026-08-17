import React, { useState, useMemo, useCallback, memo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import BrandLogo from '../components/layout/BrandLogo';
import GlowBackground from '../components/layout/GlowBackground';
import NotificationsMenu from '../components/layout/NotificationsMenu';
import {
  LayoutDashboard,
  Mic,
  Code,
  FileCheck,
  History,
  User,
  ShieldAlert,
  LogOut,
  Sun,
  Moon,
  Coins,
  Menu,
  X,
} from 'lucide-react';

/**
 * One sidebar link.
 *
 * Declared at module scope and memoized, which is the whole point: this used to be inline
 * JSX inside the nav's .map, so every DashboardLayout render rebuilt all seven links and
 * their click handlers. Combined with the state update the old handler fired on EVERY click
 * (see NavLinks below), Vercel's field data flagged this element with a 240ms INP — the
 * click handler and the render it caused were blocking the next paint well past the 200ms
 * "good" threshold.
 *
 * The `disabled` branch is a real anchor with the navigation suppressed rather than a
 * removed link, so the item keeps its place in the list and remains reachable by keyboard,
 * announcing itself as disabled instead of silently doing nothing.
 */
const NavLink = memo(({ item, isActive, disabled, onNavigate, onBlocked }) => {
  const Icon = item.icon;
  const handleClick = useCallback(
    (e) => {
      if (disabled) {
        e.preventDefault();
        onBlocked(item.name);
        return;
      }
      onNavigate();
    },
    [disabled, onBlocked, onNavigate, item.name]
  );

  return (
    <Link
      to={disabled ? '#' : item.path}
      onClick={handleClick}
      aria-current={isActive ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200 select-none ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-500'
          : isActive
            ? 'bg-primary-600 text-white shadow-md shadow-primary-600/20'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-900/60'
      }`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 min-w-0 truncate whitespace-nowrap">{item.name}</span>
    </Link>
  );
});
NavLink.displayName = 'NavLink';

const DashboardLayout = ({ children }) => {
  const { user, tokens, logout, notifications, readAllNotifications } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Replaces a blocking window.alert() in the nav click handler for the disabled Coding
  // Sandbox link. alert() freezes the main thread until it is dismissed, which is exactly
  // the kind of work that shows up as a bad INP score — and the rest of the app already
  // moved off native dialogs to non-blocking UI.
  const [blockedNotice, setBlockedNotice] = useState('');

  const isAdmin = user?.role === 'admin';

  const menuItems = useMemo(() => {
    const items = [
      { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Start Interview', path: '/interview/start', icon: Mic },
      { name: 'Coding Sandbox', path: '/coding', icon: Code },
      { name: 'Resume & JD Match', path: '/resume-match', icon: FileCheck },
      { name: 'History', path: '/history', icon: History },
      { name: 'Profile', path: '/profile', icon: User },
    ];
    if (isAdmin) items.push({ name: 'Admin Hub', path: '/admin', icon: ShieldAlert });
    return items;
  }, [isAdmin]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  // Closing the drawer is only meaningful when it is actually open. Calling this
  // unconditionally on every nav click — which is what the old handler did — queued a state
  // update and a full layout re-render on desktop, where the drawer is never open in the
  // first place. That render was landing in the same frame as the route change.
  const closeSidebarIfOpen = useCallback(() => {
    setSidebarOpen((open) => (open ? false : open));
  }, []);

  const handleBlockedNav = useCallback((name) => {
    setBlockedNotice(`${name} is still under development and not yet available.`);
  }, []);


  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 relative overflow-hidden">
      <GlowBackground />

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 glass-panel border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 lg:translate-x-0 lg:static lg:shadow-none shadow-2xl ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-200 dark:border-slate-800">
          <BrandLogo to="/dashboard" size="md" />
          <button className="lg:hidden text-slate-500 hover:text-slate-800 dark:hover:text-white p-1 rounded-lg" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-primary-400/30 flex items-center justify-center bg-slate-200 dark:bg-slate-900 shrink-0">
              {user?.profile_pic_url ? (
                <img src={user.profile_pic_url} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-primary-500 to-indigo-600 flex items-center justify-center font-bold text-white text-base">
                  {user ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" />
            </div>
            <div className="overflow-hidden min-w-0">
              <h4 className="font-semibold text-sm truncate text-slate-800 dark:text-slate-200">{user?.name}</h4>
              <span className="text-xs text-primary-500 capitalize font-medium">{user?.role}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto font-sans">
          {menuItems.map((item) => (
            <NavLink
              key={item.name}
              item={item}
              isActive={
                location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
              }
              disabled={item.path === '/coding' && !isAdmin}
              onNavigate={closeSidebarIfOpen}
              onBlocked={handleBlockedNav}
            />
          ))}
        </nav>

        {blockedNotice && (
          <div className="mx-3 mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">{blockedNotice}</p>
            <button
              type="button"
              onClick={() => setBlockedNotice('')}
              className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-700/70 hover:text-amber-700 dark:text-amber-300/70 dark:hover:text-amber-300"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all duration-200"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <header className="sticky top-0 z-30 flex items-center justify-between px-5 py-3.5 glass-panel border-b border-slate-200 dark:border-slate-800">
          <button
            className="lg:hidden text-slate-500 hover:text-slate-800 dark:hover:text-white p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-900"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={22} />
          </button>

          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 font-sans">
              SMIT Assessment Portal
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold font-sans">Candidate Center</span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/profile"
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full border transition ${
                (tokens?.tokens_available ?? 0) === 0
                  ? 'bg-red-500/10 border-red-500/30 text-red-400 animate-pulse'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
              }`}
            >
              <Coins size={15} />
              <span>{tokens?.tokens_available ?? 0} tokens</span>
            </Link>

            <button
              onClick={toggleTheme}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-900 rounded-xl transition-all"
              title="Toggle Theme"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={19} /> : <Moon size={19} />}
            </button>

            <NotificationsMenu notifications={notifications} onMarkAllRead={readAllNotifications} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 md:p-8">
          <div key={location.pathname} className="max-w-7xl mx-auto animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
