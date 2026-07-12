import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import BrandLogo from '../components/layout/BrandLogo';
import GlowBackground from '../components/layout/GlowBackground';
import Badge from '../components/ui/Badge';
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
  Bell,
  Coins,
  Menu,
  X,
} from 'lucide-react';

const DashboardLayout = ({ children }) => {
  const { user, tokens, logout, notifications, readAllNotifications } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);

  const unreadNotifs = notifications.filter(n => !n.is_read);

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Start Interview', path: '/interview/start', icon: Mic },
    { name: 'Coding Sandbox', path: '/coding', icon: Code },
    { name: 'Resume & JD Match', path: '/resume-match', icon: FileCheck },
    { name: 'History', path: '/history', icon: History },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  if (user && user.role === 'admin') {
    menuItems.push({ name: 'Admin Hub', path: '/admin', icon: ShieldAlert });
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNotifClick = () => {
    setNotifDropdownOpen(!notifDropdownOpen);
    if (!notifDropdownOpen && unreadNotifs.length > 0) {
      readAllNotifications();
    }
  };

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
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            const isSandbox = item.path === '/coding';
            const isUser = user?.role !== 'admin';
            const isDisabled = isSandbox && isUser;

            const handleClick = (e) => {
              if (isDisabled) {
                e.preventDefault();
                alert("The Coding Sandbox feature is currently under development and not yet ready for regular candidates. Please check back later!");
              } else {
                setSidebarOpen(false);
              }
            };

            return (
              <Link
                key={item.name}
                to={isDisabled ? '#' : item.path}
                onClick={handleClick}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 select-none ${
                  isDisabled
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
          })}
        </nav>

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

            <div className="relative">
              <button
                onClick={handleNotifClick}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-900 rounded-xl transition-all relative"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell size={19} />
                {unreadNotifs.length > 0 && (
                  <>
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                  </>
                )}
              </button>

              {notifDropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-slide-up">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h5 className="font-semibold text-sm text-slate-800 dark:text-white">Notifications</h5>
                    {unreadNotifs.length > 0 && (
                      <Badge variant="primary">{unreadNotifs.length} new</Badge>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-slate-500 text-sm">No notifications yet</div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`px-4 py-3 text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-900/40 ${
                            !notif.is_read ? 'bg-primary-500/5 border-l-2 border-primary-500' : ''
                          }`}
                        >
                          <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">{notif.title}</p>
                          <p className="text-slate-500 dark:text-slate-400 mb-1.5 line-clamp-2 leading-relaxed">{notif.message}</p>
                          <span className="text-[10px] text-slate-400">{new Date(notif.created_at).toLocaleDateString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
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
