import React, { useState, useEffect } from 'react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import SearchBar from '../components/ui/SearchBar';
import Spinner from '../components/ui/Spinner';
import DeleteButton from '../components/ui/DeleteButton';
import { Activity, MailWarning } from 'lucide-react';

const AdminLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('admin'); // 'admin' | 'email'

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const [adminRes, emailRes] = await Promise.all([
          api.get('/admin/logs'),
          api.get('/admin/email-logs'),
        ]);
        setLogs(adminRes.data);
        setEmailLogs(emailRes.data);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch system audit logs.');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  const handleDeleteAdminLog = async (id) => {
    setError('');
    try {
      await api.delete(`/admin/logs/${id}`);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete the log entry.');
    }
  };

  const handleDeleteEmailLog = async (id) => {
    setError('');
    try {
      await api.delete(`/admin/email-logs/${id}`);
      setEmailLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete the email log.');
    }
  };

  const filteredLogs = logs.filter((l) => {
    return (
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.admin_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const filteredEmails = emailLogs.filter((l) => {
    const q = searchTerm.toLowerCase();
    return (
      l.to_email.toLowerCase().includes(q) ||
      l.email_type.toLowerCase().includes(q) ||
      l.subject.toLowerCase().includes(q) ||
      l.status.toLowerCase().includes(q)
    );
  });

  const failedCount = emailLogs.filter((l) => l.status === 'failed').length;

  if (loading) {
    return (
      <Card className="text-center max-w-md mx-auto my-12">
        <Spinner label="Loading audit trail..." />
      </Card>
    );
  }

  const tabClass = (tab) =>
    `px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
      activeTab === tab
        ? 'bg-primary-600 text-white shadow-md'
        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Activity}
        title="System Audit Logs"
        subtitle="Administrative actions, security events, and outbound email deliveries."
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex items-center gap-2">
        <button className={tabClass('admin')} onClick={() => setActiveTab('admin')}>
          Admin Actions
        </button>
        <button className={tabClass('email')} onClick={() => setActiveTab('email')}>
          <span className="inline-flex items-center gap-1.5">
            Email Deliveries
            {failedCount > 0 && (
              <Badge variant="error" className="!normal-case">{failedCount} failed</Badge>
            )}
          </span>
        </button>
      </div>

      <Card padding={false} className="p-4">
        <SearchBar
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={activeTab === 'admin'
            ? 'Search by action type, administrator name, or keywords...'
            : 'Search by recipient, email type, subject, or status...'}
        />
      </Card>

      {activeTab === 'admin' ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 font-bold">Timestamp</th>
                  <th className="py-3 font-bold">Action Type</th>
                  <th className="py-3 font-bold">Administrator</th>
                  <th className="py-3 font-bold">Event Details</th>
                  <th className="py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-[10px]">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs font-sans">
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

                      <td className="py-4">
                        <div className="flex justify-end">
                          <DeleteButton
                            onConfirm={() => handleDeleteAdminLog(item.id)}
                            confirmMessage="Delete this audit log entry permanently?"
                            title="Delete Log Entry"
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 font-bold">Timestamp</th>
                  <th className="py-3 font-bold">Type</th>
                  <th className="py-3 font-bold">Recipient</th>
                  <th className="py-3 font-bold">Subject</th>
                  <th className="py-3 font-bold text-center">Attempts</th>
                  <th className="py-3 font-bold">Status</th>
                  <th className="py-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredEmails.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                      <MailWarning className="mx-auto mb-2 text-slate-400" size={22} />
                      No outbound emails recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredEmails.map((item) => (
                    <tr key={item.id} className="text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="py-4 text-slate-500 dark:text-slate-400 font-mono text-[10px]">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="py-4">
                        <Badge variant="info" className="!normal-case">{item.email_type}</Badge>
                      </td>
                      <td className="py-4 font-semibold text-slate-800 dark:text-slate-200">{item.to_email}</td>
                      <td className="py-4 max-w-xs truncate" title={item.subject}>{item.subject}</td>
                      <td className="py-4 text-center font-mono">{item.attempts}</td>
                      <td className="py-4">
                        <Badge variant={item.status === 'sent' ? 'success' : 'error'}>{item.status}</Badge>
                        {item.status === 'failed' && item.error && (
                          <span className="block text-[9px] text-red-400 mt-1 max-w-[180px] truncate" title={item.error}>
                            {item.error}
                          </span>
                        )}
                      </td>

                      <td className="py-4">
                        <div className="flex justify-end">
                          <DeleteButton
                            onConfirm={() => handleDeleteEmailLog(item.id)}
                            confirmMessage="Delete this email log entry permanently?"
                            title="Delete Email Log"
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdminLogsPage;
