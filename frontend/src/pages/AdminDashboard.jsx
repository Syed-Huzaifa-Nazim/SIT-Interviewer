import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import {
  Users,
  Video,
  DollarSign,
  Coins,
  MessageSquare,
  Activity,
  ShieldAlert,
  CheckCircle,
  Unlock,
  Sparkles,
  RefreshCw
} from 'lucide-react';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadDashboardData = async () => {
    try {
      setError('');
      const statsRes = await api.get('/admin/stats');
      setStats(statsRes.data);

      const usersRes = await api.get('/admin/users');
      setUsers(usersRes.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch platform metrics and statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleQuickUnban = async (userId) => {
    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/admin/users/${userId}/ban`);
      setSuccess('Student account status reopened successfully!');
      await loadDashboardData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update student access.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="text-center max-w-md mx-auto my-12">
        <Spinner label="Loading administrative metrics..." />
      </Card>
    );
  }

  const flaggedUsers = users.filter(u => u.status === 'banned');

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Sparkles}
        title="Interviewer.AI Admin Hub"
        subtitle="Real-time statistics, token pools, and student integrity proctor monitoring."
        action={
          <div className="flex items-center gap-3">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans border border-slate-200 dark:border-slate-800 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950">
              Global System: <span className="text-emerald-500 dark:text-emerald-400 font-bold">Online</span>
            </div>
            <Button variant="secondary" size="sm" icon={RefreshCw} loading={refreshing} onClick={handleRefresh}>
              Refresh
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <RouterLink to="/admin/users" className="block">
            <StatCard
              title="Registered Students"
              value={stats.users.total}
              subtext={`${stats.users.active} Active • ${stats.users.banned} Flagged`}
              icon={Users}
              color="primary"
            />
          </RouterLink>
          <RouterLink to="/admin/interviews" className="block">
            <StatCard
              title="Intake Completed"
              value={stats.interviews.completed}
              subtext={`${stats.interviews.daily} taken in last 24h`}
              icon={Video}
              color="violet"
            />
          </RouterLink>
          <RouterLink to="/admin/transactions" className="block">
            <StatCard
              title="Platform Revenue"
              value={`$${stats.revenue.total}`}
              subtext="Stripe gross sales"
              icon={DollarSign}
              color="success"
            />
          </RouterLink>
          <RouterLink to="/admin/transactions" className="block">
            <StatCard
              title="Tokens Consumed"
              value={stats.tokens.total_consumed}
              subtext={`${stats.tokens.total_available} available in pool`}
              icon={Coins}
              color="warning"
            />
          </RouterLink>
        </div>
      )}

      <Card className="relative overflow-hidden space-y-4">
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl pointer-events-none" />
        <CardHeader className="flex items-center justify-between gap-2 pb-3 mb-0 border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-red-400 shrink-0" size={20} />
            <CardTitle className="text-base mb-0">Proctor Security & Ban Audit Alerts</CardTitle>
          </div>
          <RouterLink to="/admin/users" className="text-xs text-primary-500 dark:text-primary-400 hover:underline shrink-0">
            Manage Users
          </RouterLink>
        </CardHeader>

        {flaggedUsers.length === 0 ? (
          <div className="py-6 text-center text-slate-500 dark:text-slate-400 text-xs">
            <CheckCircle className="mx-auto text-emerald-500/30 mb-2" size={24} />
            All candidate compliance profiles are clean. No active locks or day-bans.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-3 font-semibold">Student Detail</th>
                  <th className="py-3 font-semibold">Job Focus</th>
                  <th className="py-3 font-semibold">Status Reason</th>
                  <th className="py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {flaggedUsers.map(student => (
                  <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <td className="py-3.5">
                      <span className="font-bold text-slate-900 dark:text-slate-200 block">{student.name}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">{student.email}</span>
                    </td>
                    <td className="py-3.5 capitalize text-slate-600 dark:text-slate-300">{student.job_role}</td>
                    <td className="py-3.5">
                      <Badge variant="danger">Banned (3x Warnings Exceeded)</Badge>
                    </td>
                    <td className="py-3.5 text-right">
                      <Button
                        variant="success"
                        size="sm"
                        icon={Unlock}
                        onClick={() => handleQuickUnban(student.id)}
                        disabled={actionLoading}
                        className="ml-auto"
                      >
                        Reopen Access
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="text-primary-400" size={18} />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Mock Feedback Log</h3>
              </div>
              <RouterLink to="/admin/feedback" className="text-xs text-primary-500 dark:text-primary-400 hover:underline">
                View All
              </RouterLink>
            </div>

            <div className="space-y-4 divide-y divide-slate-200 dark:divide-slate-800 max-h-96 overflow-y-auto pr-1">
              {stats.feedbacks.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No feedback submissions received yet.</p>
              ) : (
                stats.feedbacks.map((f, idx) => (
                  <div key={f.id} className={`text-xs space-y-1.5 pt-4 ${idx === 0 ? 'pt-0' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-slate-200">{f.user_name}</span>
                      <span className="text-yellow-500 dark:text-yellow-400 font-bold">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                    </div>
                    {f.issues_reported && (
                      <div className="px-2 py-1 bg-red-500/5 text-[10px] text-red-500 dark:text-red-400 rounded border border-red-500/10">
                        Issue: {f.issues_reported}
                      </div>
                    )}
                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{f.feedback_text}</p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="text-indigo-400" size={18} />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">System Audit Trails</h3>
              </div>
              <RouterLink to="/admin/logs" className="text-xs text-primary-500 dark:text-primary-400 hover:underline">
                View All
              </RouterLink>
            </div>

            <div className="space-y-3.5 divide-y divide-slate-200 dark:divide-slate-800 max-h-96 overflow-y-auto pr-1 font-mono text-[10px]">
              {stats.logs.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-center py-8 font-sans">No administrative actions logged.</p>
              ) : (
                stats.logs.map((log, idx) => (
                  <div key={log.id} className={`pt-3.5 ${idx === 0 ? 'pt-0' : ''} space-y-1`}>
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-primary-500 dark:text-primary-400">{log.action}</span>
                      <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 font-sans">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
