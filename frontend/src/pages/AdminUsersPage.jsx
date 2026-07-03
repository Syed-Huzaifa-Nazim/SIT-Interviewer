import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Users, 
  Ban, 
  UserCheck, 
  Key, 
  Search, 
  AlertCircle,
  Coins
} from 'lucide-react';

const AdminUsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Overriding tokens modal state
  const [overrideUserId, setOverrideUserId] = useState(null);
  const [overrideVal, setOverrideVal] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch user accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Handle Ban/Unban user toggling
  const handleToggleBan = async (userId) => {
    setActionLoading(true);
    setError('');
    try {
      await api.post(`/admin/users/${userId}/ban`);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user status.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Override User Tokens submission
  const handleOverrideTokensSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');
    try {
      await api.post(`/admin/users/${overrideUserId}/tokens`, {
        tokens_available: overrideVal
      });
      setOverrideUserId(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user tokens.');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtering users by search term
  const filteredUsers = users.filter((u) => {
    return (
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.job_role?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center max-w-md mx-auto my-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-400">Loading user accounts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">User Accounts Manager</h1>
        <p className="text-sm text-slate-400">Control permissions, ban candidate accounts, and assign custom tokens.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2.5">
          <AlertCircle className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="glass-panel p-4 rounded-xl flex items-center">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            className="w-full glass-input pl-10 py-2.5 text-xs"
            placeholder="Search by name, email, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Users Accounts Table */}
      <div className="glass-panel p-6 rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-slate-500 border-b border-slate-900 pb-3">
                <th className="py-3 font-bold">User Details</th>
                <th className="py-3 font-bold">Profile Info</th>
                <th className="py-3 font-bold">Access Status</th>
                <th className="py-3 font-bold text-center">Token Balance</th>
                <th className="py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-xs">
                    No matching user accounts found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((item) => (
                  <tr key={item.id} className="text-slate-350 hover:bg-slate-900/10 transition-colors">
                    {/* User Details */}
                    <td className="py-4">
                      <div className="font-bold text-slate-200">{item.name}</div>
                      <div className="text-[10px] text-slate-500">{item.email}</div>
                    </td>
                    
                    {/* Job Role / Exp */}
                    <td className="py-4">
                      <div>{item.job_role || 'Not Configured'}</div>
                      <div className="text-[10px] text-slate-550 capitalize">{item.experience_level || 'Entry'} Level</div>
                    </td>

                    {/* Ban Status */}
                    <td className="py-4">
                      <div className="space-y-0.5 flex flex-col items-start">
                        <span className={`px-2.5 py-0.5 rounded-full font-bold text-[9px] ${item.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {item.status}
                        </span>
                        {item.status === 'banned' && item.banned_until && (
                          <span className="text-[9px] text-slate-500 font-medium">
                            Until {new Date(item.banned_until).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Token Balance */}
                    <td className="py-4 text-center font-mono font-bold text-slate-200">
                      {item.tokens_available}
                    </td>

                    {/* Direct Actions */}
                    <td className="py-4 text-right">
                      <div className="flex justify-end gap-2.5">
                        {/* Assign Custom Tokens button */}
                        <button
                          onClick={() => {
                            setOverrideUserId(item.id);
                            setOverrideVal(item.tokens_available);
                          }}
                          disabled={actionLoading}
                          className="p-2 bg-slate-900 border border-slate-800 hover:border-primary-500/40 text-slate-400 hover:text-white rounded-lg transition"
                          title="Assign Custom Tokens"
                        >
                          <Key size={14} />
                        </button>

                        {/* Ban / Unban Toggle Button */}
                        <button
                          onClick={() => handleToggleBan(item.id)}
                          disabled={actionLoading}
                          className={`p-2 border rounded-lg transition ${item.status === 'active' ? 'bg-red-500/5 border-red-550/20 text-red-400 hover:bg-red-650 hover:text-white' : 'bg-emerald-500/5 border-emerald-550/20 text-emerald-400 hover:bg-emerald-650 hover:text-white'}`}
                          title={item.status === 'active' ? 'Ban Account' : 'Unban Account'}
                        >
                          {item.status === 'active' ? <Ban size={14} /> : <UserCheck size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Token Override Form */}
      {overrideUserId !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form 
            onSubmit={handleOverrideTokensSubmit}
            className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-primary-500/30 space-y-5 shadow-2xl relative"
          >
            <h3 className="font-extrabold text-base text-white flex items-center gap-2">
              <Coins className="text-primary-400" size={18} />
              <span>Assign Custom Tokens</span>
            </h3>
            <p className="text-xs text-slate-400 leading-normal">
              Enter the new token balance for this candidate. This will immediately override their previous balance.
            </p>
            
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-350">New Token Balance</label>
              <input
                type="number"
                min="0"
                className="w-full glass-input text-sm text-center font-bold"
                value={overrideVal}
                onChange={(e) => setOverrideVal(parseInt(e.target.value))}
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setOverrideUserId(null)}
                className="px-4 py-2 border border-slate-800 hover:bg-slate-900 text-xs font-bold text-slate-400 hover:text-white rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"
              >
                {actionLoading ? 'Updating...' : 'Set Balance'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminUsersPage;
