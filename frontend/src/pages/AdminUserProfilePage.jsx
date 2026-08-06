import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { INTERVIEW_STATUS_LABELS } from '../utils/constants';
import {
  ChevronLeft,
  UserCircle,
  Video,
  ScanFace,
  ClipboardCheck,
  ArrowRight,
  ShieldAlert,
  Calendar,
} from 'lucide-react';

const INTERVIEW_STATUS_VARIANTS = {
  not_interviewed: 'neutral',
  invited: 'info',
  interview_completed: 'success',
  reinterview_pending: 'warning',
  reinterview_approved: 'primary',
  reinterview_rejected: 'error',
};

/**
 * Admin Hub — single candidate profile: read-only identity + three cross-linked sections
 * (Interviews, Proctoring Snapshots, Approval History) so an admin investigating one
 * candidate never has to leave and manually re-search elsewhere. Editing and video
 * playback deliberately stay where they already work (the AdminUsersPage quick-edit
 * modal, and the interview report page respectively) rather than being duplicated here.
 */
const AdminUserProfilePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [approvals, setApprovals] = useState({ pending: [], decided: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      api.get(`/admin/users/${userId}`),
      api.get('/admin/interviews', { params: { user_id: userId } }),
      api.get('/admin/proctor-snapshots', { params: { user_id: userId } }),
      api.get('/admin/reinterview-requests', { params: { user_id: userId } }),
    ])
      .then(([u, itv, snaps, appr]) => {
        if (cancelled) return;
        setUser(u.data);
        setInterviews(itv.data || []);
        setSnapshots(snaps.data || []);
        setApprovals(appr.data || { pending: [], decided: [] });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.detail || err.response?.data?.message || 'Failed to load this candidate profile.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  if (loading) {
    return (
      <Card className="text-center max-w-md mx-auto my-12">
        <Spinner label="Loading candidate profile..." />
      </Card>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4 max-w-lg mx-auto my-12">
        <Alert variant="error">{error || 'Candidate not found.'}</Alert>
        <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => navigate('/admin/users')}>
          Back to Manage Users
        </Button>
      </div>
    );
  }

  const allApprovals = [...approvals.pending, ...approvals.decided]
    .sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/admin/users')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
      >
        <ChevronLeft size={14} /> Back to Manage Users
      </button>

      <PageHeader
        icon={UserCircle}
        title={user.name}
        subtitle={`${user.email}${user.cnic ? ` · ${user.cnic}` : ''}`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Badge variant={user.status === 'active' ? 'success' : 'error'}>{user.status}</Badge>
            <Badge variant={INTERVIEW_STATUS_VARIANTS[user.interview_status] || 'neutral'}>
              {INTERVIEW_STATUS_LABELS[user.interview_status] || user.interview_status}
            </Badge>
          </div>
        }
      />

      {/* Interviews */}
      <Card>
        <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <Video size={15} className="text-primary-500" /> Interviews
          {interviews.length > 0 && <Badge variant="neutral">{interviews.length}</Badge>}
        </h3>
        {interviews.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">No interviews on record for this candidate.</p>
        ) : (
          <div className="space-y-2.5">
            {interviews.map((itv) => (
              <div key={itv.id} className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 dark:text-slate-200 capitalize">{itv.job_role}</span>
                    <Badge variant={itv.status === 'completed' ? 'success' : 'warning'}>{itv.status}</Badge>
                    {itv.is_proctor_failed && (
                      <Badge variant="error"><ShieldAlert size={10} className="mr-1" />Terminated</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    <Calendar size={10} />
                    <span>{fmtDate(itv.created_at)}</span>
                    {itv.status === 'completed' && itv.overall_score != null && (
                      <span className="font-mono font-bold text-primary-600 dark:text-primary-400">· {itv.overall_score}%</span>
                    )}
                  </div>
                </div>
                {itv.status === 'completed' ? (
                  <Link
                    to={`/interview/report/${itv.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline shrink-0"
                  >
                    View Report <ArrowRight size={12} />
                  </Link>
                ) : (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 italic shrink-0">Awaiting completion</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Proctoring Snapshots */}
      <Card>
        <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <ScanFace size={15} className="text-primary-500" /> Proctoring Snapshots
          {snapshots.length > 0 && <Badge variant="neutral">{snapshots.length}</Badge>}
        </h3>
        {snapshots.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">No archived snapshots for this candidate.</p>
        ) : (
          <div className="space-y-2">
            {(() => {
              // Group by interview so one linked row per session, not one per image.
              const byInterview = new Map();
              snapshots.forEach((s) => {
                const key = s.interview_id ?? 'unlinked';
                if (!byInterview.has(key)) byInterview.set(key, []);
                byInterview.get(key).push(s);
              });
              return Array.from(byInterview.entries()).map(([interviewId, group]) => (
                <div key={interviewId} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    <b className="text-slate-900 dark:text-slate-200">{group.length}</b> snapshot{group.length !== 1 ? 's' : ''}
                    {interviewId !== 'unlinked' ? <> for interview #{interviewId}</> : <span className="text-slate-400 italic"> (not linked to a specific interview)</span>}
                  </div>
                  <Link
                    to={interviewId !== 'unlinked' ? `/admin/logs?tab=snapshots&interview_id=${interviewId}` : '/admin/logs?tab=snapshots'}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline shrink-0"
                  >
                    View <ArrowRight size={12} />
                  </Link>
                </div>
              ));
            })()}
          </div>
        )}
      </Card>

      {/* Approval History */}
      <Card>
        <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
          <ClipboardCheck size={15} className="text-primary-500" /> Approval History
          {allApprovals.length > 0 && <Badge variant="neutral">{allApprovals.length}</Badge>}
        </h3>
        {allApprovals.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">No second-interview requests from this candidate.</p>
        ) : (
          <div className="space-y-2.5">
            {allApprovals.map((req) => (
              <div key={req.id} className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={req.status === 'approved' ? 'success' : req.status === 'rejected' ? 'error' : 'warning'}>
                      {req.status}
                    </Badge>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">Requested {fmtDate(req.requested_at)}</span>
                  </div>
                  {req.decided_at && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                      Decided {fmtDate(req.decided_at)} by {req.decided_by_name || 'an admin'}
                    </div>
                  )}
                </div>
                {req.first_interview_id && (
                  <Link
                    to={`/interview/report/${req.first_interview_id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline shrink-0"
                  >
                    View First Interview <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminUserProfilePage;
