import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import BrandLogo from '../components/layout/BrandLogo';
import ThemeToggle from '../components/layout/ThemeToggle';
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
  ChevronLeft,
  ClipboardCheck
} from 'lucide-react';

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // In-portal pending-actions badge (Update §4) — replaces admin email alerts.
  const [pendingCount, setPendingCount] = useState(0);

  const isAdmin = user && user.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    const fetchPending = () => {
      api.get('/admin/pending-actions/count')
        .then((res) => setPendingCount(res.data.total || 0))
        .catch(() => {});
    };
    fetchPending();
    // Refresh so the badge stays current while the admin works, and after they act.
    const poll = setInterval(fetchPending, 20000);
    return () => clearInterval(poll);
  }, [isAdmin, location.pathname]);

  // Security check mapping
  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center p-8">
          <ShieldCheck size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h2>
          <p className="text-slate-600 dark:text-slate-400">You require Administrator privileges to view this portal.</p>
          <button onClick={() => navigate('/dashboard')} className="mt-6 text-primary-600 font-semibold hover:underline">
            Return to Student Dashboard
          </button>
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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950 font-sans">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Admin Sidebar — theme-aware: consumes the same global `dark` class as the rest
          of the app so it switches with the theme toggle (§6.1). */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800">
          <BrandLogo variant="" />
          <button className="lg:hidden text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          <div className="px-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Administration</div>
          {adminMenu.map((item) => {
            const Icon = item.icon;
            // Prefix match (not just exact) so a drill-in page like /admin/users/42 still
            // highlights its parent section — except for the dashboard root ('/admin'),
            // which is a literal prefix of every other admin path and would otherwise stay
            // lit up no matter which section is actually open.
            const isActive = item.path === '/admin'
              ? location.pathname === '/admin'
              : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} className="shrink-0" />
                <span className="flex-1 min-w-0 truncate whitespace-nowrap">{item.name}</span>
                {item.badge > 0 && (
                  <span className={`shrink-0 min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-white text-primary-700' : 'bg-red-500 text-white'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4 font-sans">
          {/* Admin User Card — name and role stacked on two lines with size/weight
              distinction and truncation for long names (§6.2). */}
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-100 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800/50 overflow-hidden min-w-0">
            <div className="relative w-8 h-8 rounded-full overflow-hidden border border-primary-500/20 flex items-center justify-center bg-slate-200 dark:bg-slate-800 shrink-0">
              {user?.profile_pic_url ? (
                <img src={user.profile_pic_url} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-primary-500 to-indigo-600 flex items-center justify-center font-bold text-white text-xs">
                  {user ? user.name.charAt(0).toUpperCase() : 'A'}
                </div>
              )}
            </div>
            <div className="overflow-hidden min-w-0 leading-tight">
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">{user?.name}</h4>
              <span className="block text-[9px] text-primary-600 dark:text-primary-400 font-bold tracking-wide uppercase truncate">Admin</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition">
              <ChevronLeft size={16} /> Back to Admin Portal
            </Link>
            <ThemeToggle />
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-semibold text-slate-600 hover:text-red-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Admin Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
             <button className="text-slate-500 hover:text-slate-800 dark:hover:text-white lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 font-sans">
                SMIT Assessment Portal
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
              <span className="text-xs text-primary-600 dark:text-primary-400 font-bold font-sans">Admin Control Center</span>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <div key={location.pathname} className="max-w-7xl mx-auto animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;