import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import BrandLogo from '../components/layout/BrandLogo';
import ThemeToggle from '../components/layout/ThemeToggle';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, PageTransition } from '@/components/shadcn/motion';
import { Button } from '@/components/shadcn/button';
import { Avatar, AvatarImage, AvatarFallback, initialsOf, Tooltip, Separator } from '@/components/shadcn/misc';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/shadcn/dropdown-menu';
import {
  Users,
  Activity,
  MessageSquare,
  CreditCard,
  TerminalSquare,
  ScrollText,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Gauge,
  ClipboardCheck,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
} from 'lucide-react';
import { isAdminRole, isSuperAdminRole, hasPermission } from '../utils/constants';

const SIDEBAR_PREF_KEY = 'admin.sidebar.collapsed';

// NavItems and SidebarInner are declared at module scope, NOT inside AdminLayout.
//
// They used to live in the component body, which meant every AdminLayout render produced
// brand-new function identities for them. React compares element types by identity, so a
// new identity is a *different component* — it unmounted the entire sidebar subtree and
// mounted a fresh one instead of updating in place. The visible symptom was the active-nav
// pill below (a framer-motion `layoutId` element) being destroyed and recreated, replaying
// its slide animation from scratch.
//
// That fired constantly, because Manage Users keeps its search text and tab in the URL:
// every keystroke and every tab click rewrites the query string, useLocation() hands back a
// new location, AdminLayout re-renders, and the sidebar jumped — without the admin ever
// touching it. Hoisting them out keeps the identity stable across renders, so React
// reconciles the sidebar normally and the pill only animates on real navigation.

const NavItems = ({ railMode, menu, isPathActive }) => (
  <nav className={cn('flex-1 space-y-1 overflow-y-auto overflow-x-hidden py-4', railMode ? 'px-2' : 'px-3')}>
    {!railMode && (
      <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
        Administration
      </div>
    )}
    {menu.map((item) => {
      const Icon = item.icon;
      const active = isPathActive(item.path);
      const link = (
        <Link
          key={item.name}
          to={item.path}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'group relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-semibold transition-colors',
            railMode ? 'justify-center px-2' : 'px-3',
            active
              ? 'text-sidebar-primary-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          {/* One shared pill that slides between items rather than two cross-fading
              backgrounds, so the selection reads as movement instead of a flicker. */}
          {active && (
            <motion.span
              layoutId="admin-nav-active"
              className="absolute inset-0 rounded-lg bg-sidebar-primary shadow-sm"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          <Icon className="relative size-[18px] shrink-0" />
          {!railMode && <span className="relative min-w-0 flex-1 truncate">{item.name}</span>}
          {item.badge > 0 && (
            <span
              className={cn(
                'relative inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                railMode && 'absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1',
                active ? 'bg-white text-primary' : 'bg-destructive text-destructive-foreground'
              )}
            >
              {item.badge}
            </span>
          )}
        </Link>
      );

      // In rail mode the label is gone, so the tooltip is the only way to identify it.
      return railMode ? (
        <Tooltip key={item.name} content={item.name} side="right">
          <div>{link}</div>
        </Tooltip>
      ) : (
        link
      );
    })}
  </nav>
);

const SidebarInner = ({ railMode = false, onClose, menu, isPathActive }) => (
  <>
    <div
      className={cn(
        'flex h-16 shrink-0 items-center border-b border-sidebar-border',
        railMode ? 'justify-center px-2' : 'justify-between px-5'
      )}
    >
      {railMode ? (
        <Link to="/admin" aria-label="Overview" className="grid size-9 place-items-center rounded-lg bg-primary/10">
          <ShieldCheck className="size-5 text-primary" />
        </Link>
      ) : (
        <>
          <BrandLogo variant="" />
          {onClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} className="lg:hidden" aria-label="Close menu">
              <X className="size-5" />
            </Button>
          )}
        </>
      )}
    </div>

    <NavItems railMode={railMode} menu={menu} isPathActive={isPathActive} />

    <div className={cn('shrink-0 border-t border-sidebar-border py-3', railMode ? 'px-2' : 'px-3')}>
      {railMode ? (
        <Tooltip content="Student Dashboard" side="right">
          <Button variant="ghost" size="icon" asChild className="w-full">
            <Link to="/dashboard" aria-label="Student Dashboard">
              <LayoutDashboard className="size-[18px]" />
            </Link>
          </Button>
        </Tooltip>
      ) : (
        <Link
          to="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LayoutDashboard className="size-[18px] shrink-0" />
          <span className="truncate">Student Dashboard</span>
        </Link>
      )}
    </div>
  </>
);

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop icon-rail preference. Persisted so an admin who works collapsed does not
  // have to re-collapse on every page load.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_PREF_KEY) === '1';
    } catch {
      return false;
    }
  });
  // In-portal pending-actions badge (Update §4) — replaces admin email alerts.
  const [pendingCount, setPendingCount] = useState(0);

  const isAdmin = user && isAdminRole(user.role);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const fetchPending = () => {
      api
        .get('/admin/pending-actions/count')
        .then((res) => setPendingCount(res.data.total || 0))
        .catch(() => {});
    };
    fetchPending();
    // Refresh so the badge stays current while the admin works, and after they act.
    const poll = setInterval(fetchPending, 20000);
    return () => clearInterval(poll);
  }, [isAdmin, location.pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_PREF_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable (private mode) — the preference just won't persist */
      }
      return next;
    });
  }, []);

  // Close the mobile drawer on navigation, so a tap-through never leaves it hanging open.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  if (!user || !isAdminRole(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-destructive/10">
            <ShieldCheck className="size-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Access Restricted</h2>
          <p className="text-muted-foreground text-sm">
            You require Administrator privileges to view this portal.
          </p>
          <Button className="mt-6" onClick={() => navigate('/dashboard')}>
            Return to Student Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Each entry's `permission` names the scope its page's data actually requires server-side
  // (see admin_routes.py) — filtered out below for an admin who doesn't hold it, so a
  // narrowly-permissioned admin's sidebar matches what they can actually open instead of
  // linking to pages that would just 403. Undefined `permission` means every admin sees it
  // regardless (Manage Users' own actions are still individually gated where they matter).
  const adminMenu = [
    { name: 'Overview', path: '/admin', icon: Activity, permission: 'analytics:read' },
    { name: 'Manage Users', path: '/admin/users', icon: Users, permission: 'candidates:read' },
    { name: 'Approvals', path: '/admin/approvals', icon: ClipboardCheck, badge: pendingCount, permission: 'reinterview:decide' },
    { name: 'Interviews', path: '/admin/interviews', icon: TerminalSquare, permission: 'interviews:read' },
    { name: 'Scoring Analytics', path: '/admin/scoring', icon: Gauge, permission: 'analytics:read' },
    { name: 'Transactions', path: '/admin/transactions', icon: CreditCard, permission: 'transactions:read' },
    { name: 'Feedback', path: '/admin/feedback', icon: MessageSquare, permission: 'candidates:read' },
    { name: 'Logs', path: '/admin/logs', icon: ScrollText, permission: 'audit:read' },
  ].filter((item) => !item.permission || hasPermission(user, item.permission));

  // Shown to a super admin only. /superadmin is a top-level route outside this layout, so
  // following it leaves the Admin Hub shell entirely — which is right: the management
  // portal runs on its own session and must not look like another tab of the Hub.
  if (isSuperAdminRole(user.role)) {
    adminMenu.push({ name: 'Super Admin', path: '/superadmin', icon: ShieldCheck });
  }

  // Prefix match (not just exact) so a drill-in page like /admin/users/42 still highlights
  // its parent section — except for the dashboard root ('/admin'), which is a literal
  // prefix of every other admin path and would otherwise stay lit up permanently.
  const isPathActive = (path) =>
    path === '/admin'
      ? location.pathname === '/admin'
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  const activeItem = adminMenu.find((i) => isPathActive(i.path));

  return (
    // The shell is locked to the viewport and ONLY <main> scrolls. Previously the outer box
    // was min-h-screen, so the whole page scrolled and main's overflow-y-auto never
    // engaged — the sidebar had to fake staying put with `sticky`, which re-pins on every
    // scroll and reads as the rail detaching and lagging behind the content.
    // dvh rather than vh so mobile browsers measure the visible area, not the area behind
    // the address bar.
    // print:!h-auto/!overflow-visible: this shell is viewport-locked on screen (only <main>
    // scrolls) with no print override at all — index.css's global print block resets <main>
    // itself, but this OUTER wrapper's own overflow-hidden still clipped everything to one
    // viewport-height page regardless, since a child's overflow:visible can't escape a
    // parent that's still clipping. That's what was capping every printed report to
    // whatever fit on screen instead of paginating across as many pages as it needs.
    <div className="flex h-dvh overflow-hidden bg-background font-sans print:!h-auto print:!overflow-visible">
      {/* ---------------------------------------------------------- desktop sidebar */}
      <aside
        className={cn(
          'hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 lg:flex',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarInner railMode={collapsed} menu={adminMenu} isPathActive={isPathActive} />
      </aside>

      {/* ----------------------------------------------------------- mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              key="admin-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              key="admin-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar lg:hidden"
            >
              <SidebarInner onClose={() => setSidebarOpen(false)} menu={adminMenu} isPathActive={isPathActive} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------ content area */}
      {/* min-h-0 is what lets <main> actually scroll: without it a flex child refuses to
          shrink below its content height and the overflow escapes the shell instead. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* No longer sticky — main is the only scroll container, so the header simply
            stays where it is. */}
        <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
            </Button>

            <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />

            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden truncate text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground sm:inline">
                SMIT Assessment Portal
              </span>
              <span className="hidden size-1.5 shrink-0 rounded-full bg-accent-500 sm:inline-block" />
              <span className="truncate text-sm font-bold text-foreground">
                {activeItem ? activeItem.name : 'Admin Control Center'}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-accent cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  aria-label="Account menu"
                >
                  <Avatar className="size-8">
                    {user?.profile_pic_url && <AvatarImage src={user.profile_pic_url} alt={user.name} />}
                    <AvatarFallback>{initialsOf(user?.name)}</AvatarFallback>
                  </Avatar>
                  <span className="hidden min-w-0 text-left sm:block">
                    <span className="block max-w-[10rem] truncate text-xs font-bold text-foreground">{user?.name}</span>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-primary">Admin</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Signed in</DropdownMenuLabel>
                <div className="px-2 pb-1.5">
                  <p className="truncate text-sm font-semibold text-foreground">{user?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">
                    <LayoutDashboard /> Student Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
                  <LogOut /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <PageTransition key={location.pathname} className="mx-auto max-w-7xl">
            {children}
          </PageTransition>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
