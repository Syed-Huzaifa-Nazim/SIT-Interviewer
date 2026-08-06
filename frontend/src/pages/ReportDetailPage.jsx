import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import { cn, formatScore } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/shadcn/card';
import { Badge } from '@/components/shadcn/badge';
import { Input, Textarea, Label, NativeSelect } from '@/components/shadcn/input';
import { ChartContainer, ChartTooltip, ChartTooltipContent, scoreColor } from '@/components/shadcn/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import {
  Activity,
  AlertCircle,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Info,
  MessageSquare,
  Printer,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  X,
  Clock,
  ListChecks,
} from 'lucide-react';

const THUMB_COUNT = 4;

/**
 * Tolerantly unwrap a field the API may hand back as an array, a JSON string, or a
 * double-encoded JSON string. Returning [] on anything unexpected keeps a malformed
 * record from taking down the whole scorecard.
 */
const asList = (value) => {
  try {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    let parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const VIOLATION_TONE = {
  NO_FACE: 'destructive',
  MULTIPLE_HANDS: 'destructive',
  HAND_DETECTED: 'destructive',
  MULTIPLE_FACES: 'warning',
  LOOK_AWAY: 'warning',
  KEYBOARD_SHORTCUT: 'warning',
  TAB_SWITCH: 'info',
  FOCUS_LOSS: 'info',
};

const ReportDetailPage = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  /* ------------------------------------------------------------- session video */
  const [videoUrl, setVideoUrl] = useState('');
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [videoPlaybackError, setVideoPlaybackError] = useState('');

  const loadSessionVideo = useCallback(async () => {
    setVideoLoading(true);
    setVideoError('');
    try {
      const res = await api.get(`/admin/interviews/${id}/video-url`);
      setVideoUrl(res.data.video_url);
    } catch (err) {
      setVideoError(err.response?.data?.detail || 'Could not load the session recording.');
    } finally {
      setVideoLoading(false);
    }
  }, [id]);

  /* ------------------------------------------------------ proctoring snapshots */
  const [auditSnapshots, setAuditSnapshots] = useState([]);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [snapshotUrlCache, setSnapshotUrlCache] = useState({});
  const [snapshotUrlLoading, setSnapshotUrlLoading] = useState(false);
  const [snapshotUrlError, setSnapshotUrlError] = useState('');
  const [thumbUrlCache, setThumbUrlCache] = useState({});

  useEffect(() => {
    if (!isAdmin || !data?.interview?.id) return undefined;
    let cancelled = false;
    api
      .get('/admin/proctor-snapshots', { params: { interview_id: data.interview.id } })
      .then((res) => {
        if (!cancelled) setAuditSnapshots(res.data || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin, data?.interview?.id]);

  // Full-size URLs are signed and short-lived, so they are fetched per view and cached
  // for the session rather than all up front.
  useEffect(() => {
    if (!snapshotModalOpen) return;
    const snap = auditSnapshots[snapshotIndex];
    if (!snap || snapshotUrlCache[snap.id]) return;
    setSnapshotUrlLoading(true);
    setSnapshotUrlError('');
    api
      .get(`/admin/proctor-snapshots/${snap.id}/url`)
      .then((res) => setSnapshotUrlCache((prev) => ({ ...prev, [snap.id]: res.data.image_url })))
      .catch(() => setSnapshotUrlError('Could not load this snapshot.'))
      .finally(() => setSnapshotUrlLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotModalOpen, snapshotIndex, auditSnapshots]);

  useEffect(() => {
    if (auditSnapshots.length === 0) return;
    auditSnapshots
      .slice(0, THUMB_COUNT)
      .filter((s) => !thumbUrlCache[s.id])
      .forEach((snap) => {
        api
          .get(`/admin/proctor-snapshots/${snap.id}/url`)
          .then((res) => setThumbUrlCache((prev) => ({ ...prev, [snap.id]: res.data.image_url })))
          .catch(() => {});
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditSnapshots]);

  // Logs and snapshots are not linked by id, but both carry timestamps — so opening the
  // gallery from a log entry lands on whichever capture is closest in time to it.
  const openSnapshotModal = (log) => {
    if (auditSnapshots.length > 0) {
      const logTime = new Date(log.timestamp).getTime();
      let bestIdx = 0;
      let bestDiff = Infinity;
      auditSnapshots.forEach((s, i) => {
        const diff = Math.abs(new Date(s.captured_at).getTime() - logTime);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      });
      setSnapshotIndex(bestIdx);
    } else {
      setSnapshotIndex(0);
    }
    setSnapshotModalOpen(true);
  };

  // Escape closes the gallery — expected of any modal, and the only way out for keyboard users.
  useEffect(() => {
    if (!snapshotModalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setSnapshotModalOpen(false);
      if (e.key === 'ArrowLeft') setSnapshotIndex((i) => (i - 1 + auditSnapshots.length) % auditSnapshots.length);
      if (e.key === 'ArrowRight') setSnapshotIndex((i) => (i + 1) % auditSnapshots.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snapshotModalOpen, auditSnapshots.length]);

  /* ------------------------------------------------------------------ feedback */
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [issuesReported, setIssuesReported] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    setFeedbackLoading(true);
    try {
      await api.post('/feedback', {
        rating,
        feedback_text: feedbackText,
        issues_reported: issuesReported,
        interview_id: parseInt(id, 10),
      });
      setFeedbackSubmitted(true);
    } catch (err) {
      console.error('Failed to submit user feedback:', err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  /* -------------------------------------------------------------- report fetch */
  useEffect(() => {
    let cancelled = false;
    let pollId = null;

    const fetchReport = async () => {
      try {
        const res = await api.get(`/interviews/${id}/report`);
        if (cancelled) return;
        setData(res.data);
        setError('');
        // Scoring runs in the background: keep polling until the report lands, then stop.
        if (!res.data.report && res.data.scoring_status === 'in_progress') {
          if (!pollId) pollId = setInterval(fetchReport, 3000);
        } else if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.message || 'Failed to retrieve assessment scorecard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchReport();

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
    };
  }, [id]);

  /* ------------------------------------------------------------ derived values */
  const proctorLogsList = useMemo(() => asList(data?.interview?.proctor_logs), [data]);

  const violationSummary = useMemo(() => {
    const counts = new Map();
    proctorLogsList.forEach((log) => {
      counts.set(log.type, (counts.get(log.type) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, label: type.replace(/_/g, ' '), count }))
      .sort((a, b) => b.count - a.count);
  }, [proctorLogsList]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" label="Generating detailed performance report..." />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="mx-auto my-10 max-w-md text-center">
        <CardContent className="space-y-4">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <h3 className="text-lg font-bold text-foreground">Error Loading Report</h3>
          <p className="text-sm text-muted-foreground">{error || 'Report details could not be found.'}</p>
          <Button asChild size="sm">
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Interview finished but the AI is still grading. The effect above polls until it
  // resolves, so this view replaces itself with the scorecard automatically.
  if (!data.report) {
    return (
      <Card className="mx-auto my-10 max-w-md text-center">
        <CardContent className="space-y-4">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10">
            <Activity className="size-7 animate-pulse text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Scoring in progress</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your interview is complete. Our AI is grading each answer and assembling your detailed
            scorecard now — this page will update automatically in a few moments.
          </p>
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-primary">
            <Spinner size="sm" />
            <span>Evaluating responses…</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { interview, report, qna } = data;
  const strengths = asList(report.strengths);
  const weaknesses = asList(report.weaknesses);

  const verdict = interview.is_proctor_failed
    ? { label: 'Audit Fail', variant: 'destructive' }
    : report.overall_score >= 80
      ? { label: 'Distinction Pass', variant: 'success' }
      : report.overall_score >= 60
        ? { label: 'Standard Pass', variant: 'default' }
        : { label: 'Review Required', variant: 'warning' };

  const showVideoCard = isAdmin && interview.has_video;

  const competencies = [
    { name: 'Technical Depth', score: report.technical_score },
    { name: 'Communication', score: report.communication_score },
    { name: 'Confidence', score: report.confidence_score },
    { name: 'Problem Solving', score: report.problem_solving_score },
  ].map((c) => ({ ...c, fill: scoreColor(c.score) }));

  const answeredCount = qna.filter((q) => q.response).length;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'transcript', label: 'Q&A Transcript', icon: BookOpen, badge: qna.length },
    {
      id: 'compliance',
      label: 'Compliance',
      icon: ShieldAlert,
      badge: proctorLogsList.length || (interview.is_proctor_failed ? '!' : null),
      danger: true,
    },
    { id: 'feedback', label: 'Remarks', icon: MessageSquare },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin Tools', icon: UserCheck }] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10 print:max-w-none print:space-y-5 print:text-black">
      {/* ------------------------------------------------------- print-only header */}
      <div className="hidden print:block print:border-b print:border-slate-300 print:pb-3">
        <h1 className="text-2xl font-black uppercase tracking-tight text-black">SMIT Assessment Scorecard</h1>
        <p className="mt-1 text-xs text-slate-600">
          Candidate Evaluation Record · {interview.job_role} · {new Date(interview.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* ------------------------------------------------------------- toolbar */}
      <div className="no-print flex items-center justify-between gap-4 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to={isAdmin ? '/admin/interviews' : '/history'}>
            <ChevronLeft />
            {isAdmin ? 'Back to Interviews' : 'Back to History'}
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer /> Print Scorecard
        </Button>
      </div>

      {interview.is_proctor_failed && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 print:border-slate-400">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <h3 className="text-sm font-extrabold text-foreground">Session terminated by the proctor</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              This assessment ended automatically after the system logged repeated integrity
              infractions. Read the scores alongside the compliance evidence before deciding.
            </p>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- hero */}
      <Card className="overflow-hidden print:break-inside-avoid print:shadow-none">
        <CardContent className="grid grid-cols-1 items-center gap-6 pt-0 md:grid-cols-[auto_1fr]">
          <ScoreGauge score={report.overall_score} verdict={verdict} />

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default" className="capitalize">
                {interview.type} Assessment
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {interview.difficulty} Level
              </Badge>
              {interview.proctor_violations_count > 0 && (
                <Badge variant="warning">
                  <ShieldAlert /> {interview.proctor_violations_count} violations
                </Badge>
              )}
            </div>

            <h2 className="text-xl font-extrabold capitalize text-foreground md:text-2xl">
              {interview.job_role} Candidate Scorecard
            </h2>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                {new Date(interview.created_at).toLocaleDateString()}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ListChecks className="size-3.5" />
                {answeredCount} of {qna.length} answered
              </span>
            </div>

            <div className="rounded-xl border border-border bg-muted/50 p-3.5 print:border-slate-300">
              <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                AI Performance Summary
              </h4>
              <p className="text-xs font-medium leading-relaxed text-foreground/80">
                {interview.feedback_summary ||
                  `Candidate completed the assessment for target role ${interview.job_role}.`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- tabs */}
      <div className="no-print flex gap-1 overflow-x-auto border-b border-border print:hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex shrink-0 cursor-pointer items-center gap-2 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide outline-none transition-colors',
                'focus-visible:ring-[3px] focus-visible:ring-ring/40',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" />
              {tab.label}
              {tab.badge !== undefined && tab.badge !== null && tab.badge !== 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                    tab.danger ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                  )}
                >
                  {tab.badge}
                </span>
              )}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------- TAB: overview */}
      <div className={cn('space-y-6', activeTab === 'overview' ? 'block' : 'hidden print:block')}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="print:break-inside-avoid print:shadow-none lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Competency Breakdown</CardTitle>
              <CardDescription>Scored 0–100 per dimension</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                className="aspect-auto h-48 w-full"
                config={{ score: { label: 'Score' } }}
              >
                <BarChart data={competencies} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={104}
                    fontSize={11}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent hideIndicator formatter={(v) => `${v}%`} />}
                  />
                  <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={16}>
                    {competencies.map((c) => (
                      <Cell key={c.name} fill={c.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            {competencies.map((item) => (
              <Card key={item.name} className="gap-0 py-4 print:shadow-none">
                <CardContent className="px-4">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {item.name}
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-extrabold" style={{ color: item.fill }}>
                      {formatScore(item.score)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${Math.max(0, Math.min(100, item.score || 0))}%`, backgroundColor: item.fill }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 print:break-inside-avoid">
          <PointsCard
            title="Identified Strengths"
            icon={ThumbsUp}
            tone="text-emerald-600 dark:text-emerald-400"
            dot="bg-emerald-500"
            items={strengths}
            empty="No specific strengths parsed."
          />
          <PointsCard
            title="Areas for Improvement"
            icon={ThumbsDown}
            tone="text-destructive"
            dot="bg-destructive"
            items={weaknesses}
            empty="No major deficiencies identified."
          />
        </div>

        <Card className="print:break-inside-avoid print:shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="size-4 text-primary" /> Candidate Growth Roadmap
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-2">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Actionable Steps
              </span>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
                {report.recommendations || 'No specific improvements registered.'}
              </p>
            </div>
            <div className="space-y-1.5 rounded-xl border border-border bg-muted/50 p-3.5 print:border-slate-300">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <Info className="size-3 text-primary" /> Missing Core Concepts
              </span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {report.missing_concepts || 'No missing concepts identified.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ----------------------------------------------------- TAB: transcript */}
      <div className={cn('space-y-4', activeTab === 'transcript' ? 'block' : 'hidden print:block')}>
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground">Graded Q&amp;A Log</h3>
        {qna.map((item, idx) => (
          <Card key={idx} className="gap-4 print:break-inside-avoid print:shadow-none">
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <Badge variant="secondary" size="sm">
                    Question {idx + 1}
                  </Badge>
                  <h4 className="text-sm font-bold leading-snug text-foreground">
                    {item.question.question_text}
                  </h4>
                </div>
                {item.response && (
                  <div className="shrink-0 text-right">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Score
                    </span>
                    <span className="text-lg font-extrabold" style={{ color: scoreColor(item.response.score) }}>
                      {formatScore(item.response.score)}%
                    </span>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-3.5 print:border-slate-300">
                <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                  Candidate Answer
                </span>
                <p className="mt-1 text-xs font-medium italic leading-relaxed text-foreground/80">
                  &ldquo;{item.response?.response_text || 'No answer recorded.'}&rdquo;
                </p>
              </div>

              {item.response && (
                <div className="space-y-1">
                  <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    AI Grading Feedback
                  </span>
                  <p className="text-xs leading-relaxed text-muted-foreground">{item.response.feedback}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ----------------------------------------------------- TAB: compliance */}
      <div className={cn('space-y-6', activeTab === 'compliance' ? 'block' : 'hidden print:block')}>
        {violationSummary.length > 0 && (
          <Card className="print:break-inside-avoid print:shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Violation Summary</CardTitle>
              <CardDescription>
                {proctorLogsList.length} event{proctorLogsList.length === 1 ? '' : 's'} logged during this session
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {violationSummary.map((v) => (
                <div
                  key={v.type}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 print:border-slate-300"
                >
                  <Badge variant={VIOLATION_TONE[v.type] || 'secondary'} size="sm">
                    {v.label}
                  </Badge>
                  <span className="font-mono text-sm font-bold text-foreground">{v.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className={cn('print:shadow-none', showVideoCard ? '' : 'lg:col-span-2')}>
            <CardHeader>
              <CardTitle className="text-sm">Webcam Audit Snapshots</CardTitle>
            </CardHeader>
            <CardContent>
              {isAdmin && auditSnapshots.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {auditSnapshots.slice(0, THUMB_COUNT).map((snap, idx) => (
                      <button
                        key={snap.id}
                        type="button"
                        onClick={() => {
                          setSnapshotIndex(idx);
                          setSnapshotModalOpen(true);
                        }}
                        title={`${snap.kind === 'termination' ? 'Webcam' : 'Screen'} · ${new Date(snap.captured_at).toLocaleTimeString()}`}
                        className="relative aspect-video cursor-pointer overflow-hidden rounded-lg border border-border bg-muted transition hover:border-primary"
                      >
                        {thumbUrlCache[snap.id] ? (
                          <img
                            src={thumbUrlCache[snap.id]}
                            alt="Archived proctoring thumbnail"
                            className="size-full object-cover"
                          />
                        ) : (
                          <span className="grid size-full place-items-center">
                            <Spinner size="sm" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => {
                      setSnapshotIndex(0);
                      setSnapshotModalOpen(true);
                    }}
                  >
                    {auditSnapshots.length > THUMB_COUNT
                      ? `View all ${auditSnapshots.length} snapshots`
                      : 'Open full-size viewer'}
                    <ChevronRight />
                  </Button>
                </div>
              ) : report.snapshot_image ? (
                <div className="space-y-3">
                  <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-muted">
                    <img
                      src={report.snapshot_image}
                      alt="Integrity breach frame"
                      className="size-full object-cover"
                    />
                    <Badge variant="destructive" size="sm" className="absolute left-2 top-2">
                      Violation Frame
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {report.snapshot_description || 'Compliance snapshot logged by system monitoring.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 rounded-xl border-2 border-dashed border-border p-8 text-center">
                  <UserCheck className="mx-auto size-7 text-emerald-500" />
                  <h4 className="text-xs font-bold text-foreground">Clean Compliance Record</h4>
                  <p className="mx-auto max-w-[260px] text-xs leading-normal text-muted-foreground">
                    No visual integrity flags were logged by the proctoring engine.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {showVideoCard && (
            <Card className="no-print print:hidden">
              <CardHeader>
                <CardTitle className="text-sm">Session Recording</CardTitle>
              </CardHeader>
              <CardContent>
                {videoUrl && !videoPlaybackError ? (
                  <video
                    controls
                    src={videoUrl}
                    className="max-h-[420px] w-full rounded-xl bg-black"
                    // Playback can fail after load (expired signed URL, codec, dropped
                    // network). Surface it with a retry rather than a frozen player.
                    onError={() =>
                      setVideoPlaybackError(
                        'The recording could not be played — the secure link may have expired.'
                      )
                    }
                  />
                ) : (
                  <div className="space-y-3 rounded-xl border-2 border-dashed border-border p-6 text-center">
                    <p className="text-xs text-muted-foreground">
                      A full-session camera recording is stored for this interview.
                    </p>
                    {(videoError || videoPlaybackError) && (
                      <Alert variant="error" className="text-xs">
                        {videoError || videoPlaybackError}
                      </Alert>
                    )}
                    <Button
                      size="sm"
                      disabled={videoLoading}
                      onClick={() => {
                        setVideoUrl('');
                        setVideoPlaybackError('');
                        loadSessionVideo();
                      }}
                    >
                      {videoLoading
                        ? 'Preparing secure link…'
                        : videoPlaybackError
                          ? 'Retry Playback'
                          : 'Play Session Recording'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="print:shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Integrity Audit Trail</CardTitle>
            </CardHeader>
            <CardContent>
              {proctorLogsList.length > 0 ? (
                <div className="max-h-[400px] space-y-0 overflow-y-auto pr-1">
                  {proctorLogsList.map((log, idx) => (
                    <div
                      key={idx}
                      onClick={isAdmin ? () => openSnapshotModal(log) : undefined}
                      title={isAdmin ? 'View archived snapshots near this moment' : undefined}
                      className={cn(
                        'flex flex-col gap-1 border-b border-border py-2.5 text-xs last:border-0',
                        isAdmin && 'no-print -mx-2 cursor-pointer rounded-lg px-2 transition hover:bg-accent'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={VIOLATION_TONE[log.type] || 'secondary'} size="sm">
                          {log.type.replace(/_/g, ' ')}
                        </Badge>
                        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground">
                          <Clock className="size-3" />
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="font-medium leading-relaxed text-foreground/80">{log.details}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-8 text-center text-xs italic text-muted-foreground">
                  Zero violation trails logged.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* -------------------------------------------------------- snapshot modal */}
      {snapshotModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
            onClick={() => setSnapshotModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Integrity snapshot gallery"
          >
            <div
              className="relative w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border p-4">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-foreground">
                  <ShieldAlert className="size-4 text-primary" /> Integrity Snapshot Gallery
                </h3>
                <Button variant="ghost" size="icon-sm" onClick={() => setSnapshotModalOpen(false)} aria-label="Close">
                  <X />
                </Button>
              </div>

              <div className="space-y-3 p-4">
                {auditSnapshots.length === 0 ? (
                  <p className="p-10 text-center text-xs italic text-muted-foreground">
                    No archived snapshots are on file for this session.
                  </p>
                ) : (
                  <>
                    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
                      {snapshotUrlLoading ? (
                        <Spinner label="Loading snapshot..." />
                      ) : snapshotUrlError ? (
                        <p className="px-4 text-center text-xs text-destructive">{snapshotUrlError}</p>
                      ) : (
                        <img
                          src={snapshotUrlCache[auditSnapshots[snapshotIndex]?.id]}
                          alt="Archived proctoring snapshot"
                          className="size-full object-contain"
                        />
                      )}
                      <Badge
                        variant={auditSnapshots[snapshotIndex]?.kind === 'termination' ? 'destructive' : 'info'}
                        size="sm"
                        className="absolute left-2 top-2"
                      >
                        {auditSnapshots[snapshotIndex]?.kind === 'termination' ? 'Webcam Frame' : 'Screen Capture'}
                      </Badge>
                      {auditSnapshots.length > 1 && (
                        <>
                          <button
                            type="button"
                            aria-label="Previous snapshot"
                            onClick={() =>
                              setSnapshotIndex((i) => (i - 1 + auditSnapshots.length) % auditSnapshots.length)
                            }
                            className="absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-slate-900/60 p-2 text-white transition hover:bg-slate-900/80"
                          >
                            <ChevronLeft className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Next snapshot"
                            onClick={() => setSnapshotIndex((i) => (i + 1) % auditSnapshots.length)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-slate-900/60 p-2 text-white transition hover:bg-slate-900/80"
                          >
                            <ChevronRight className="size-4" />
                          </button>
                        </>
                      )}
                    </div>

                    {auditSnapshots.length > 1 && (
                      <input
                        type="range"
                        min={0}
                        max={auditSnapshots.length - 1}
                        step={1}
                        value={snapshotIndex}
                        onChange={(e) => setSnapshotIndex(parseInt(e.target.value, 10))}
                        className="w-full cursor-pointer accent-primary"
                        aria-label="Snapshot position"
                      />
                    )}

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>
                        {auditSnapshots[snapshotIndex]?.captured_at
                          ? new Date(auditSnapshots[snapshotIndex].captured_at).toLocaleString()
                          : ''}
                      </span>
                      <span>
                        {snapshotIndex + 1} / {auditSnapshots.length}
                      </span>
                    </div>

                    {auditSnapshots[snapshotIndex]?.label && (
                      <p className="text-xs text-muted-foreground">{auditSnapshots[snapshotIndex].label}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ------------------------------------------------------- TAB: feedback */}
      <div className={cn(activeTab === 'feedback' ? 'block' : 'hidden print:block')}>
        <Card className="print:shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Submit Assessment Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            {feedbackSubmitted ? (
              <Alert variant="success" className="text-xs font-bold">
                Thank you! Your feedback has been registered.
              </Alert>
            ) : (
              <form onSubmit={handleSubmitFeedback} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="rating">Rate this assessment session</Label>
                    <NativeSelect
                      id="rating"
                      value={rating}
                      onChange={(e) => setRating(parseInt(e.target.value, 10))}
                    >
                      <option value="5">★★★★★ (5 — Excellent)</option>
                      <option value="4">★★★★☆ (4 — Good)</option>
                      <option value="3">★★★☆☆ (3 — Average)</option>
                      <option value="2">★★☆☆☆ (2 — Poor)</option>
                      <option value="1">★☆☆☆☆ (1 — Very Bad)</option>
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="issues">Report any hardware / AI issues</Label>
                    <Input
                      id="issues"
                      placeholder="e.g. Minor lag in speech transcript."
                      value={issuesReported}
                      onChange={(e) => setIssuesReported(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="remarks">Review Remarks</Label>
                  <Textarea
                    id="remarks"
                    placeholder="Share your thoughts about this assessment experience…"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={feedbackLoading}>
                    {feedbackLoading ? 'Submitting…' : 'Submit Feedback'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------------- TAB: admin */}
      {isAdmin && (
        <div className={cn('no-print', activeTab === 'admin' ? 'block' : 'hidden')}>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Admin Tools</CardTitle>
              <CardDescription>Cross-links scoped to this session</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ToolLink
                to={`/admin/scoring?interview_id=${interview.id}`}
                title="LLM Scoring Breakdown"
                desc="Per-question score, confidence and rationale."
              />
              <ToolLink
                to={`/admin/logs?tab=snapshots&interview_id=${interview.id}`}
                title="Proctoring Snapshots"
                desc="Every archived webcam/screen image from this session."
              />
              <ToolLink
                to={`/admin/users/${interview.user_id}`}
                title="Candidate Profile"
                desc="Interviews, snapshots and approval history."
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ subviews */

/** Radial score gauge. The arc is drawn with stroke-dashoffset so it animates in via a
 *  CSS transition — no JS animation loop, and it prints as a static filled arc. */
const ScoreGauge = ({ score, verdict }) => {
  const radius = 44;
  const strokeWidth = 7;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score || 0));
  const offset = circumference - (pct / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center gap-3 md:border-r md:border-border md:pr-6 print:border-slate-300">
      <div className="relative grid size-36 select-none place-items-center">
        <svg className="size-32 -rotate-90" viewBox="0 0 128 128">
          <circle className="text-muted" strokeWidth={strokeWidth} stroke="currentColor" fill="transparent" r={radius} cx="64" cy="64" />
          <circle
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            stroke={color}
            fill="transparent"
            r={radius}
            cx="64"
            cy="64"
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-foreground">{formatScore(score)}%</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Overall</span>
        </div>
      </div>
      <Badge variant={verdict.variant} size="lg">
        {verdict.label}
      </Badge>
    </div>
  );
};

const PointsCard = ({ title, icon: Icon, tone, dot, items, empty }) => (
  <Card className="print:shadow-none">
    <CardHeader>
      <CardTitle className={cn('flex items-center gap-2 text-sm', tone)}>
        <Icon className="size-4" /> {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <ul className="space-y-2.5 text-xs text-muted-foreground">
        {items.length === 0 ? (
          <li className="italic text-muted-foreground/70">{empty}</li>
        ) : (
          items.map((str, idx) => (
            <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
              <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', dot)} />
              <span>{str}</span>
            </li>
          ))
        )}
      </ul>
    </CardContent>
  </Card>
);

const ToolLink = ({ to, title, desc }) => (
  <Link
    to={to}
    className="flex flex-col gap-1 rounded-xl border border-border p-4 transition hover:border-primary hover:bg-accent/50"
  >
    <span className="text-xs font-bold text-foreground">{title}</span>
    <span className="text-[10px] leading-relaxed text-muted-foreground">{desc}</span>
  </Link>
);

export default ReportDetailPage;
