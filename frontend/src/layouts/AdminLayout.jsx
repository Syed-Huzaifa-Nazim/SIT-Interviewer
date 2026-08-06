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

const SIDEBAR_PREF_KEY = 'admin.sidebar.collapsed';

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

  const isAdmin = user && user.role === 'admin';

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

  if (!user || user.role !== 'admin') {
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

  const adminMenu = [
    { name: 'Overview', path: '/admin', icon: Activity },
    { name: 'Manage Users', path: '/admin/users', icon: Users },
    { name: 'Approvals', path: '/admin/approvals', icon: ClipboardCheck, badge: pendingCount },
    { name: 'Interviews', path: '/admin/interviews', icon: TerminalSquare },
    { name: 'Scoring Analytics', path: '/admin/scoring', icon: Gauge },
    { name: 'Transactions', path: '/admin/transactions', icon: CreditCard },
    { name: 'Feedback', path: '/admin/feedback', icon: MessageSquare },
    { name: 'Logs', path: '/admin/logs', icon: ScrollText },
  ];

  // Prefix match (not just exact) so a drill-in page like /admin/users/42 still highlights
  // its parent section — except for the dashboard root ('/admin'), which is a literal
  // prefix of every other admin path and would otherwise stay lit up permanently.
  const isPathActive = (path) =>
    path === '/admin'
      ? location.pathname === '/admin'
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  const activeItem = adminMenu.find((i) => isPathActive(i.path));

  const NavItems = ({ railMode }) => (
    <nav className={cn('flex-1 space-y-1 overflow-y-auto overflow-x-hidden py-4', railMode ? 'px-2' : 'px-3')}>
      {!railMode && (
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          Administration
        </div>
      )}
      {adminMenu.map((item) => {
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

  const SidebarInner = ({ railMode = false, onClose }) => (
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

      <NavItems railMode={railMode} />

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

  return (
    <div className="flex min-h-screen bg-background font-sans">
      {/* ---------------------------------------------------------- desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 lg:flex',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarInner railMode={collapsed} />
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
              <SidebarInner onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------ content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/85 px-4 backdrop-blur-md lg:px-6">
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
