import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Activity, 
  Search, 
  AlertCircle,
  Calendar,
  ShieldCheck
} from 'lucide-react';

const AdminLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await api.get('/admin/logs');
        setLogs(res.data);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch system audit logs.');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((l) => {
    return (
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.admin_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center max-w-md mx-auto my-12">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-400">Loading audit trail...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">System Audit Logs</h1>
        <p className="text-sm text-slate-400">Chronological trail of platform administrative actions and security events.</p>
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
            placeholder="Search by action type, administrator name, or keywords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Audit Logs list Table */}
      <div className="glass-panel p-6 rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-slate-500 border-b border-slate-900 pb-3">
                <th className="py-3 font-bold">Timestamp</th>
                <th className="py-3 font-bold">Action Type</th>
                <th className="py-3 font-bold">Administrator</th>
                <th className="py-3 font-bold">Event Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 font-mono text-[10px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-slate-500 text-xs font-sans">
                    No administrative audit logs recorded.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((item) => (
                  <tr key={item.id} className="text-slate-350 hover:bg-slate-900/10 transition-colors">
                    {/* Timestamp */}
                    <td className="py-4 text-slate-500">
                      {new Date(item.created_at).toLocaleString()}
                    </td>

                    {/* Action Type */}
                    <td className="py-4">
                      <span className="px-2 py-0.5 bg-primary-500/10 border border-primary-500/20 text-primary-400 font-bold rounded">
                        {item.action}
                      </span>
                    </td>

                    {/* Admin User */}
                    <td className="py-4 font-sans font-bold text-slate-200">
                      {item.admin_name}
                      <span className="text-[10px] text-slate-500 font-normal block">{item.admin_email || 'System Action'}</span>
                    </td>

                    {/* Details */}
                    <td className="py-4 text-slate-300 font-sans max-w-sm whitespace-pre-wrap leading-relaxed">
                      {item.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminLogsPage;
