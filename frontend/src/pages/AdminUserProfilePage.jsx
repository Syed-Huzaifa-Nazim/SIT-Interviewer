import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Alert from '../components/ui/Alert';
import { INTERVIEW_STATUS_LABELS } from '../utils/constants';
import { cn } from '@/lib/utils';
import { Badge, StatusBadge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Avatar, AvatarImage, AvatarFallback, initialsOf, Separator } from '@/components/shadcn/misc';
import { StaggerItem, Reveal, AuroraBackdrop } from '@/components/shadcn/motion';
import { scoreColor } from '@/components/shadcn/chart';
import { AdminEmpty, AdminPageSkeleton } from '@/components/shadcn/page';
import {
  ChevronLeft,
  Video,
  ScanFace,
  ClipboardCheck,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Mail,
  IdCard,
} from 'lucide-react';

const INTERVIEW_STATUS_VARIANTS = {
  not_interviewed: 'secondary',
  invited: 'info',
  interview_completed: 'success',
  reinterview_pending: 'warning',
  reinterview_approved: 'default',
  reinterview_rejected: 'destructive',
};

/**
 * Admin Hub — one candidate, with their interviews, proctoring evidence and approval
 * history cross-linked in one place so an investigation never has to leave and re-search.
 * Editing and video playback deliberately stay where they already work (the Manage Users
 * quick-edit, and the report page) rather than being duplicated here.
 */
const AdminUserProfilePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  // Same reasoning as ReportDetailPage's Back button: this profile is reachable from more
  // than one place (Manage Users, the Interviews list, ...), so a hardcoded destination is
  // wrong whenever the admin arrived from anywhere else. window.history.state.idx (set by
  // React Router's data router on every navigate/push) survives a page refresh, unlike
  // location.key — checked here instead for that reason.
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  const goBack = () => (canGoBack ? navigate(-1) : navigate('/admin/users'));

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
        setError(
          err.response?.data?.detail || err.response?.data?.message || 'Failed to load this candidate profile.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const allApprovals = useMemo(
    () =>
      [...(approvals.pending || []), ...(approvals.decided || [])].sort(
        (a, b) => new Date(b.requested_at) - new Date(a.requested_at)
      ),
    [approvals]
  );

  // Grouped by interview so the list shows one row per session rather than one per image.
  const snapshotGroups = useMemo(() => {
    const byInterview = new Map();
    snapshots.forEach((s) => {
      const key = s.interview_id ?? 'unlinked';
      if (!byInterview.has(key)) byInterview.set(key, []);
      byInterview.get(key).push(s);
    });
    return Array.from(byInterview.entries());
  }, [snapshots]);

  const bestScore = useMemo(() => {
    const scored = interviews.filter((i) => typeof i.overall_score === 'number');
    return scored.length ? Math.max(...scored.map((i) => i.overall_score)) : null;
  }, [interviews]);

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  if (loading) return <AdminPageSkeleton rows={4} cols={3} />;

  if (error || !user) {
    return (
      <div className="mx-auto my-12 max-w-lg space-y-4">
        <Alert variant="error">{error || 'Candidate not found.'}</Alert>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/users')}>
          <ChevronLeft /> Back to Manage Users
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2">
        <ChevronLeft /> Back
      </Button>

      {/* --------------------------------------------------------- identity card */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 lg:p-6">
        <AuroraBackdrop />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-14 border border-border">
              {user.profile_pic_url && <AvatarImage src={user.profile_pic_url} alt={user.name} />}
              <AvatarFallback className="text-base">{initialsOf(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">
                {user.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" />
                  {user.email}
                </span>
                {user.cnic && (
                  <span className="inline-flex items-center gap-1.5 font-mono">
                    <IdCard className="size-3.5" />
                    {user.cnic}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {user.online ? (
              <StatusBadge variant="success" pulse>
                Online
              </StatusBadge>
            ) : (
              <Badge variant="secondary">Offline</Badge>
            )}
            <Badge variant={user.status === 'active' ? 'success' : 'destructive'}>{user.status}</Badge>
            <Badge variant={INTERVIEW_STATUS_VARIANTS[user.interview_status] || 'secondary'}>
              {INTERVIEW_STATUS_LABELS[user.interview_status] || user.interview_status}
            </Badge>
          </div>
        </div>

        <Separator className="relative my-4" />

        <dl className="relative grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="Interviews" value={interviews.length} />
          <Fact
            label="Best Score"
            value={bestScore === null ? '—' : `${bestScore}%`}
            color={bestScore === null ? undefined : scoreColor(bestScore)}
          />
          <Fact label="Snapshots" value={snapshots.length} />
          <Fact label="Tokens" value={user.tokens_available ?? 0} />
        </dl>
      </div>

      {/* ------------------------------------------------------------ interviews */}
      <Reveal>
        <Section icon={Video} title="Interviews" count={interviews.length}>
          {interviews.length === 0 ? (
            <AdminEmpty icon={Video} title="No interviews on record" message="This candidate has not sat an interview yet." />
          ) : (
            <div className="space-y-2.5">
              {interviews.map((itv, idx) => (
                <StaggerItem key={itv.id} index={idx}>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3.5 transition-colors hover:border-primary/30">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold capitalize text-foreground">{itv.job_role}</span>
                        <Badge variant={itv.status === 'completed' ? 'success' : 'warning'} size="sm">
                          {itv.status}
                        </Badge>
                        {itv.is_proctor_failed && (
                          <Badge variant="destructive" size="sm">
                            <ShieldAlert /> Terminated
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Calendar className="size-3" />
                        {fmtDate(itv.created_at)}
                        {itv.status === 'completed' && itv.overall_score != null && (
                          <span className="font-mono font-bold" style={{ color: scoreColor(itv.overall_score) }}>
                            · {itv.overall_score}%
                          </span>
                        )}
                      </div>
                    </div>
                    {itv.status === 'completed' ? (
                      <Button variant="outline" size="sm" asChild className="shrink-0">
                        <Link to={`/interview/report/${itv.id}`}>
                          View Report <ArrowRight />
                        </Link>
                      </Button>
                    ) : (
                      <span className="shrink-0 text-[11px] italic text-muted-foreground">Awaiting completion</span>
                    )}
                  </div>
                </StaggerItem>
              ))}
            </div>
          )}
        </Section>
      </Reveal>

      {/* ------------------------------------------------------------- snapshots */}
      <Reveal>
        <Section icon={ScanFace} title="Proctoring Snapshots" count={snapshots.length}>
          {snapshotGroups.length === 0 ? (
            <AdminEmpty icon={ScanFace} title="No archived snapshots" message="Nothing was captured for this candidate." />
          ) : (
            <div className="space-y-2">
              {snapshotGroups.map(([interviewId, group]) => (
                <div
                  key={interviewId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/30"
                >
                  <p className="text-xs text-muted-foreground">
                    <b className="text-foreground">{group.length}</b> snapshot{group.length === 1 ? '' : 's'}
                    {interviewId !== 'unlinked' ? (
                      <> for interview #{interviewId}</>
                    ) : (
                      <span className="italic"> (not linked to a specific interview)</span>
                    )}
                  </p>
                  <Button variant="ghost" size="sm" asChild className="shrink-0">
                    <Link
                      to={
                        interviewId !== 'unlinked'
                          ? `/admin/logs?tab=snapshots&interview_id=${interviewId}`
                          : '/admin/logs?tab=snapshots'
                      }
                    >
                      View <ArrowRight />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </Reveal>

      {/* -------------------------------------------------------------- approvals */}
      <Reveal>
        <Section icon={ClipboardCheck} title="Approval History" count={allApprovals.length}>
          {allApprovals.length === 0 ? (
            <AdminEmpty
              icon={ClipboardCheck}
              title="No second-interview requests"
              message="This candidate has not asked for another attempt."
            />
          ) : (
            <div className="space-y-2.5">
              {allApprovals.map((req, idx) => (
                <StaggerItem key={req.id} index={idx}>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3.5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          size="sm"
                          variant={
                            req.status === 'approved'
                              ? 'success'
                              : req.status === 'rejected'
                                ? 'destructive'
                                : 'warning'
                          }
                        >
                          {req.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          Requested {fmtDate(req.requested_at)}
                        </span>
                      </div>
                      {req.decided_at && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Decided {fmtDate(req.decided_at)} by {req.decided_by_name || 'an admin'}
                        </p>
                      )}
                    </div>
                    {req.first_interview_id && (
                      <Button variant="ghost" size="sm" asChild className="shrink-0">
                        <Link to={`/interview/report/${req.first_interview_id}`}>
                          First interview <ArrowRight />
                        </Link>
                      </Button>
                    )}
                  </div>
                </StaggerItem>
              ))}
            </div>
          )}
        </Section>
      </Reveal>
    </div>
  );
};

const Section = ({ icon: Icon, title, count, children }) => (
  <section className="rounded-xl border border-border bg-card p-5">
    <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold text-foreground">
      <Icon className="size-4 text-primary" /> {title}
      {count > 0 && (
        <Badge variant="secondary" size="sm">
          {count}
        </Badge>
      )}
    </h3>
    {children}
  </section>
);

const Fact = ({ label, value, color }) => (
  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
    <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
    <dd className={cn('mt-0.5 text-lg font-extrabold text-foreground')} style={color ? { color } : undefined}>
      {value}
    </dd>
  </div>
);

export default AdminUserProfilePage;
