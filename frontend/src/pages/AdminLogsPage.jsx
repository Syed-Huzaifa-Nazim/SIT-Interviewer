import React, { useState, useEffect } from 'react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import SearchBar from '../components/ui/SearchBar';
import Spinner from '../components/ui/Spinner';
import { Activity } from 'lucide-react';

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
      <Card className="text-center max-w-md mx-auto my-12">
        <Spinner label="Loading audit trail..." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        title="System Audit Logs"
        subtitle="Chronological trail of platform administrative actions and security events."
      />

      {error && <Alert variant="error">{error}</Alert>}

      <Card padding={false} className="p-4">
        <SearchBar
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by action type, administrator name, or keywords..."
        />
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 font-bold">Timestamp</th>
                <th className="py-3 font-bold">Action Type</th>
                <th className="py-3 font-bold">Administrator</th>
                <th className="py-3 font-bold">Event Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-[10px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs font-sans">
                    No administrative audit logs recorded.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((item) => (
                  <tr key={item.id} className="text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <td className="py-4 text-slate-500 dark:text-slate-400">
                      {new Date(item.created_at).toLocaleString()}
                    </td>

                    <td className="py-4">
                      <Badge variant="primary">{item.action}</Badge>
                    </td>

                    <td className="py-4 font-sans font-bold text-slate-900 dark:text-slate-200">
                      {item.admin_name}
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal block">{item.admin_email || 'System Action'}</span>
                    </td>

                    <td className="py-4 text-slate-700 dark:text-slate-300 font-sans max-w-sm whitespace-pre-wrap leading-relaxed">
                      {item.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AdminLogsPage;
