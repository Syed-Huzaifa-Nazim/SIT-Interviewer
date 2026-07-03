import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { 
  Users, 
  Video, 
  DollarSign, 
  Coins, 
  MessageSquare, 
  Activity, 
  AlertCircle 
} from 'lucide-react';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/admin/stats');
        setStats(res.data);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch platform metrics and statistics.');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center max-w-md mx-auto my-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-400">Loading system metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Overview Dashboard</h1>
        <p className="text-sm text-slate-400">Real-time statistics, token balances, and platform activities.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2.5">
          <AlertCircle className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Candidates */}
          <div className="glass-panel p-6 rounded-2xl flex items-center justify-between relative overflow-hidden">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Registered Users</span>
              <span className="text-3xl font-extrabold text-white">{stats.users.total}</span>
              <span className="text-[10px] text-slate-400 block pt-1">{stats.users.active} Active &bull; {stats.users.banned} Banned</span>
            </div>
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
              <Users size={20} />
            </div>
          </div>

          {/* Daily Mock Interviews */}
          <div className="glass-panel p-6 rounded-2xl flex items-center justify-between relative overflow-hidden">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Completed Mocks</span>
              <span className="text-3xl font-extrabold text-white">{stats.interviews.completed}</span>
              <span className="text-[10px] text-slate-400 block pt-1">{stats.interviews.daily} taken in last 24h</span>
            </div>
            <div className="p-3 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl">
              <Video size={20} />
            </div>
          </div>

          {/* Total Revenue */}
          <div className="glass-panel p-6 rounded-2xl flex items-center justify-between relative overflow-hidden">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Platform Revenue</span>
              <span className="text-3xl font-extrabold text-white">${stats.revenue.total}</span>
              <span className="text-[10px] text-slate-400 block pt-1">Stripe Checkout gross sales</span>
            </div>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
              <DollarSign size={20} />
            </div>
          </div>

          {/* Token Pool metrics */}
          <div className="glass-panel p-6 rounded-2xl flex items-center justify-between relative overflow-hidden">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Tokens Consumed</span>
              <span className="text-3xl font-extrabold text-white">{stats.tokens.total_consumed}</span>
              <span className="text-[10px] text-slate-400 block pt-1">{stats.tokens.total_available} available in pool</span>
            </div>
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl">
              <Coins size={20} />
            </div>
          </div>
        </div>
      )}

      {/* Grid Layout: Feedback & Audit Logs preview */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Feedback Feed */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="text-primary-400" size={18} />
                <h3 className="font-bold text-base text-white">Mock Feedback Log</h3>
              </div>
              <Link to="/admin/feedback" className="text-xs text-primary-400 hover:underline">
                View All
              </Link>
            </div>

            <div className="space-y-4 divide-y divide-slate-900 max-h-96 overflow-y-auto pr-1">
              {stats.feedbacks.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">No feedback submissions received yet.</p>
              ) : (
                stats.feedbacks.map((f, idx) => (
                  <div key={f.id} className={`text-xs space-y-1.5 pt-4 ${idx === 0 ? 'pt-0' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{f.user_name}</span>
                      <span className="text-yellow-400 font-bold">{'★'.repeat(f.rating)}{'☆'.repeat(5-f.rating)}</span>
                    </div>
                    {f.issues_reported && (
                      <div className="px-2 py-1 bg-red-500/5 text-[10px] text-red-400 rounded border border-red-500/10">
                        Issue: {f.issues_reported}
                      </div>
                    )}
                    <p className="text-slate-400 leading-relaxed font-sans">{f.feedback_text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Administrative Audit Logs */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="text-indigo-400" size={18} />
                <h3 className="font-bold text-base text-white">Recent System Audit Trails</h3>
              </div>
              <Link to="/admin/logs" className="text-xs text-primary-400 hover:underline">
                View All
              </Link>
            </div>

            <div className="space-y-3.5 divide-y divide-slate-900 max-h-96 overflow-y-auto pr-1 font-mono text-[10px]">
              {stats.logs.length === 0 ? (
                <p className="text-slate-650 text-center py-8 font-sans">No administrative actions logged.</p>
              ) : (
                stats.logs.map((log, idx) => (
                  <div key={log.id} className={`pt-3.5 ${idx === 0 ? 'pt-0' : ''} space-y-1`}>
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="font-bold text-primary-400">{log.action}</span>
                      <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-350">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
