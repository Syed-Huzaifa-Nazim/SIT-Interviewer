import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  Video, 
  Coins, 
  MessageSquare, 
  Activity, 
  LayoutDashboard, 
  ArrowLeft,
  LogOut,
  Sparkles
} from 'lucide-react';

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900/40 border-r border-slate-900/60 backdrop-blur-md flex flex-col justify-between shrink-0 sticky top-0 h-screen p-5 z-20">
        <div className="space-y-8">
          {/* Logo */}
          <Link to="/admin" className="flex items-center gap-2 font-extrabold text-lg text-white tracking-tight pl-1.5">
            <div className="p-1.5 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-lg">
              <Sparkles size={16} className="text-white" />
            </div>
            <span>Admin Workspace</span>
          </Link>

          {/* Nav List */}
          <nav className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block pl-2 mb-2">Control Panel</span>
            {navItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={idx}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => 
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 ${
                      isActive 
                        ? 'bg-primary-600/10 border border-primary-500/20 text-white' 
                        : 'border border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50'
                    }`
                  }
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* User Footer block */}
        <div className="space-y-3 pt-5 border-t border-slate-900">
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 px-3 py-2 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition"
          >
            <ArrowLeft size={14} />
            <span>Return to Site</span>
          </Link>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl text-xs font-bold transition"
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="flex-1 min-w-0 p-8 md:p-10 max-h-screen overflow-y-auto relative">
        {/* Glow Spots */}
        <div className="glow-spot bg-primary-600 top-[-20%] right-[-10%] w-96 h-96 opacity-10"></div>
        <div className="glow-spot bg-indigo-700 bottom-[-20%] left-[-10%] w-96 h-96 opacity-5"></div>
        
        {/* Children Component */}
        <div className="relative z-10 space-y-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
