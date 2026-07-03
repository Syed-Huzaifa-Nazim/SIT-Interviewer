import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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
  Sparkles
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

  // If user is admin, append Admin dashboard option
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
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* Glow Spots */}
      <div className="glow-spot bg-primary-600 top-[-10%] left-[-10%]"></div>
      <div className="glow-spot bg-indigo-600 bottom-[-10%] right-[-10%]"></div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex flex-col w-64 glass-panel border-r border-slate-800 transition-transform duration-300 lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800">
          <Link to="/dashboard" className="flex items-center gap-2 font-bold text-xl tracking-tight text-white">
            <div className="p-1.5 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-lg">
              <Sparkles size={20} className="text-white" />
            </div>
            <span>Interviewer<span className="text-primary-500">.AI</span></span>
          </Link>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {/* User Card */}
        <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary-500 to-purple-600 flex items-center justify-center font-bold text-white text-base border border-primary-400/30">
              {user ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="overflow-hidden">
              <h4 className="font-semibold text-sm truncate text-slate-200">{user?.name}</h4>
              <span className="text-xs text-primary-400 capitalize">{user?.role}</span>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/25 border-l-4 border-primary-300' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        {/* Top Navbar */}
        <header className="flex items-center justify-between lg:justify-end px-6 py-4 glass-panel border-b border-slate-800">
          {/* Mobile Menu Button */}
          <button 
            className="lg:hidden text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>

          {/* Right Header Controls */}
          <div className="flex items-center gap-4">
            {/* Tokens Balance Indicator */}
            <Link to="/profile" className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm font-semibold rounded-full shadow-inner">
              <Coins size={16} />
              <span>Tokens: {tokens?.tokens_available ?? 0}</span>
            </Link>

            {/* Dark Mode Toggle */}
            <button 
              onClick={toggleTheme}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-all"
              title="Toggle Theme"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Notifications Indicator */}
            <div className="relative">
              <button 
                onClick={handleNotifClick}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-all relative"
                title="Notifications"
              >
                <Bell size={20} />
                {unreadNotifs.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                )}
                {unreadNotifs.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {notifDropdownOpen && (
                <div className="absolute right-0 mt-2 w-80 glass-panel border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
                    <h5 className="font-semibold text-sm">Notifications</h5>
                    {unreadNotifs.length > 0 && (
                      <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full font-medium">
                        {unreadNotifs.length} new
                      </span>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-slate-500 text-sm">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div 
                          key={notif.id} 
                          className={`px-4 py-3 text-xs transition-colors hover:bg-slate-900/40 ${!notif.is_read ? 'bg-slate-900/20 border-l-2 border-primary-500' : ''}`}
                        >
                          <p className="font-semibold text-slate-200 mb-1">{notif.title}</p>
                          <p className="text-slate-400 mb-1.5 line-clamp-2 leading-relaxed">{notif.message}</p>
                          <span className="text-[10px] text-slate-500">
                            {new Date(notif.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Children Render Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
