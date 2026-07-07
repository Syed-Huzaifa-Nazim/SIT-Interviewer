import React, { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/layout/BrandLogo';
import GlowBackground from '../components/layout/GlowBackground';
import {
  Users,
  Video,
  Coins,
  MessageSquare,
  Activity,
  LayoutDashboard,
  ArrowLeft,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

const AdminLayout = ({ children }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'User Accounts', icon: Users },
    { to: '/admin/interviews', label: 'Mock Sessions', icon: Video },
    { to: '/admin/transactions', label: 'Transactions', icon: Coins },
    { to: '/admin/feedback', label: 'Candidate Feedbacks', icon: MessageSquare },
    { to: '/admin/logs', label: 'System Audit Logs', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 glass-panel border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 transition-transform duration-300 lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 space-y-8">
          <div className="flex items-center justify-between">
            <BrandLogo to="/admin" variant="admin" />
            <button className="lg:hidden text-slate-500 hover:text-white p-1" onClick={() => setSidebarOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <nav className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block pl-2 mb-2">Control Panel</span>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 ${
                      isActive
                        ? 'bg-primary-600/10 border border-primary-500/25 text-primary-600 dark:text-white'
                        : 'border border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-slate-900/50'
                    }`
                  }
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="p-5 space-y-2 border-t border-slate-200 dark:border-slate-800">
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2 border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-xl text-xs font-bold transition"
          >
            <ArrowLeft size={14} />
            <span>Return to Site</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-500/10 text-slate-500 dark:text-slate-400 hover:text-red-500 rounded-xl text-xs font-bold transition"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 flex items-center px-5 py-3 glass-panel border-b border-slate-200 dark:border-slate-800">
          <button className="text-slate-500 hover:text-slate-800 dark:hover:text-white p-2" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <span className="ml-3 font-bold text-sm text-slate-800 dark:text-white">Admin Panel</span>
        </header>

        <main className="flex-1 min-w-0 p-5 md:p-8 lg:p-10 max-h-screen overflow-y-auto relative animate-fade-in">
          <GlowBackground />
          <div className="relative z-10 space-y-8 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
