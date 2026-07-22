import React, { useState, useEffect } from 'react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import Pagination from '../components/ui/Pagination';

const PAGE_SIZE = 10;
import EmptyState from '../components/ui/EmptyState';
import { ClipboardCheck, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';

/**
 * Second-Interview Approval Queue (§4.3): pending re-interview requests with the
 * candidate's history; approving emails fresh one-time credentials, rejecting
 * emails the ineligibility notice — both automatically.
 */
const AdminApprovalsPage = () => {
  const [pending, setPending] = useState([]);
  const [decided, setDecided] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actingId, setActingId] = useState(null);
  const [page, setPage] = useState(1);

  const fetchRequests = async () => {
    try {
      const res = await api.get('/admin/reinterview-requests');
      setPending(res.data.pending || []);
      setDecided(res.data.decided || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load second-interview requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const decide = async (req, decision) => {
    const verb = decision === 'approve' ? 'APPROVE' : 'REJECT';
    if (!window.confirm(
      `${verb} second interview for ${req.name} (CNIC ${req.cnic})?\n\n` +
      (decision === 'approve'
        ? 'A fresh one-time password will be emailed to the candidate automatically.'
        : 'The candidate will be emailed that they are not eligible for a second interview.')
    )) {
      return;
    }

    setActingId(req.id);
    setError('');
    setNotice('');
    try {
      const res = await api.post(`/admin/reinterview-requests/${req.id}/decision`, { decision });
      setNotice(res.data.message || 'Decision recorded.');
      fetchRequests();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record the decision.');
    } finally {
      setActingId(null);
    }
  };

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  if (loading) {
    return (
      <Card className="text-center max-w-md mx-auto my-12">
        <Spinner label="Loading approval queue..." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ClipboardCheck}
        title="Second-Interview Approvals"
        subtitle="Review candidates requesting a second interview attempt. Decisions trigger the corresponding email automatically."
      />

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {/* Pending queue */}
      <Card>
        <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          Pending Requests
          {pending.length > 0 && <Badge variant="warning">{pending.length}</Badge>}
        </h3>

        {pending.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            message="No pending requests. When a previously-interviewed candidate signs up again, their request will appear here."
          />
        ) : (
          <div className="space-y-4">
            {pending.map((req) => (
              <div
                key={req.id}
                className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-900/40 flex flex-col lg:flex-row lg:items-center gap-4"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-white">{req.name}</span>
                    <Badge variant="primary">{req.cnic}</Badge>
                    {req.course_category && <Badge variant="default">{req.course_category}</Badge>}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{req.email}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-5 gap-y-1 pt-1">
                    <span>Requested: <b className="text-slate-700 dark:text-slate-300">{fmtDate(req.requested_at)}</b></span>
                    <span>First interview: <b className="text-slate-700 dark:text-slate-300">{req.first_interview_date ? new Date(req.first_interview_date).toLocaleDateString() : 'On record'}</b></span>
                    <span>
                      First score:{' '}
                      <b className="text-slate-700 dark:text-slate-300">
                        {req.first_interview_score !== null && req.first_interview_score !== undefined
                          ? `${req.first_interview_score}%`
                          : 'N/A'}
                      </b>
                    </span>
                    {req.first_interview_proctor_failed && (
                      <span className="flex items-center gap-1 text-red-500 font-semibold">
                        <ShieldAlert size={12} /> First attempt terminated by proctoring
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <Button
                    variant="success"
                    size="sm"
                    icon={CheckCircle2}
                    onClick={() => decide(req, 'approve')}
                    disabled={actingId !== null}
                    loading={actingId === req.id}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={XCircle}
                    onClick={() => decide(req, 'reject')}
                    disabled={actingId !== null}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Decision history */}
      <Card>
        <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-4">Decision History</h3>
        {decided.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">No decisions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 font-bold">Candidate</th>
                  <th className="py-3 font-bold">CNIC</th>
                  <th className="py-3 font-bold">Decision</th>
                  <th className="py-3 font-bold">Decided By</th>
                  <th className="py-3 font-bold">Decided At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {decided.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((req) => (
                  <tr key={req.id} className="text-slate-600 dark:text-slate-300">
                    <td className="py-3">
                      <div className="font-bold text-slate-900 dark:text-slate-200">{req.name}</div>
                      <div className="text-[10px] text-slate-500">{req.email}</div>
                    </td>
                    <td className="py-3 font-mono">{req.cnic}</td>
                    <td className="py-3">
                      <Badge variant={req.status === 'approved' ? 'success' : 'error'}>{req.status}</Badge>
                    </td>
                    <td className="py-3">{req.decided_by_name || '—'}</td>
                    <td className="py-3">{fmtDate(req.decided_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={decided.length} onChange={setPage} />
      </Card>
    </div>
  );
};

export default AdminApprovalsPage;
