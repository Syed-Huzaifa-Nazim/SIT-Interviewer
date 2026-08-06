import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import SnapshotGallery from '../components/report/SnapshotGallery';
import { cn, formatScore } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { Badge } from '@/components/shadcn/badge';
import { Input, Textarea, Label, NativeSelect } from '@/components/shadcn/input';
import { scoreColor } from '@/components/shadcn/chart';
import {
  Activity,
  AlertCircle,
  BookOpen,
  Calendar,
  ChevronLeft,
  Clock,
  Info,
  ListChecks,
  MessageSquare,
  Printer,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  Video,
} from 'lucide-react';

/**
 * Tolerantly unwrap a field the API may return as an array, a JSON string, or a
 * double-encoded JSON string. Returning [] on anything unexpected keeps one malformed
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
        // Scoring runs in the background: poll until the report lands, then stop.
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

  const proctorLogsList = useMemo(() => asList(data?.interview?.proctor_logs), [data]);

  const violationSummary = useMemo(() => {
    const counts = new Map();
    proctorLogsList.forEach((log) => counts.set(log.type, (counts.get(log.type) || 0) + 1));
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, label: type.replace(/_/g, ' '), count }))
      .sort((a, b) => b.count - a.count);
  }, [proctorLogsList]);

  /* ------------------------------------------------------------- early states */

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner size="lg" label="Generating detailed performance report..." />
      </div>
    );
  }

  if (!data) {
    return (
      <CenteredCard>
        <AlertCircle className="mx-auto size-8 text-destructive" />
        <h3 className="text-lg font-bold text-foreground">Error Loading Report</h3>
        <p className="text-sm text-muted-foreground">{error || 'Report details could not be found.'}</p>
        <Button asChild size="sm">
          <Link to="/dashboard">Back to Dashboard</Link>
        </Button>
      </CenteredCard>
    );
  }

  if (!data.report) {
    return (
      <CenteredCard>
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
      </CenteredCard>
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

  const showVideo = isAdmin && interview.has_video;
  const answeredCount = qna.filter((q) => q.response).length;

  const competencies = [
    { name: 'Technical', score: report.technical_score },
    { name: 'Communication', score: report.communication_score },
    { name: 'Confidence', score: report.confidence_score },
    { name: 'Problem Solving', score: report.problem_solving_score },
  ].map((c) => ({ ...c, fill: scoreColor(c.score) }));

  const tabs = [
    { id: 'overview', label: 'Analysis', icon: Activity },
    { id: 'transcript', label: 'Transcript', icon: BookOpen, badge: qna.length },
    {
      id: 'compliance',
      label: 'Evidence',
      icon: ShieldAlert,
      badge: proctorLogsList.length || (interview.is_proctor_failed ? '!' : null),
      danger: true,
    },
    ...(showVideo ? [{ id: 'recording', label: 'Recording', icon: Video }] : []),
    { id: 'feedback', label: 'Remarks', icon: MessageSquare },
    ...(isAdmin ? [{ id: 'admin', label: 'Tools', icon: UserCheck }] : []),
  ];

  /* ------------------------------------------------------------------ render */

  return (
    // A fixed-height console rather than a long scrolling document: the verdict rail stays
    // put while the evidence pane scrolls on its own, so a reviewer never loses the score
    // they are judging against. Below lg the two panes cannot both fit, so the page falls
    // back to normal flow. Print ignores all of it and lays the report out as a document.
    <div
      className={cn(
        'flex flex-col gap-3',
        'lg:h-[calc(100dvh-8rem)] lg:overflow-hidden',
        'print:block print:h-auto print:overflow-visible'
      )}
    >
      {/* --------------------------------------------------------- print header */}
      <div className="hidden print:block print:border-b print:border-slate-300 print:pb-3">
        <h1 className="text-2xl font-black uppercase tracking-tight text-black">SMIT Assessment Scorecard</h1>
        <p className="mt-1 text-xs text-slate-600">
          {interview.job_role} · {new Date(interview.created_at).toLocaleDateString()} · Interview #{interview.id}
        </p>
      </div>

      {/* -------------------------------------------------------------- toolbar */}
      <div className="no-print flex shrink-0 items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to={isAdmin ? '/admin/interviews' : '/history'}>
            <ChevronLeft />
            {isAdmin ? 'Back to Interviews' : 'Back to History'}
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {interview.is_proctor_failed && (
            <Badge variant="destructive">
              <ShieldAlert /> Terminated by proctor
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------ two panes */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[19rem_1fr] print:block">
        {/* ------------------------------------------------------- summary rail */}
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-4 print:break-inside-avoid print:overflow-visible print:border-slate-300">
          <ScoreGauge score={report.overall_score} verdict={verdict} />

          <div className="space-y-1 text-center">
            <h2 className="text-sm font-extrabold capitalize leading-tight text-foreground">
              {interview.job_role}
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Badge variant="secondary" size="sm" className="capitalize">
                {interview.type}
              </Badge>
              <Badge variant="secondary" size="sm" className="capitalize">
                {interview.difficulty}
              </Badge>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-center">
            <Fact icon={Calendar} label="Date" value={new Date(interview.created_at).toLocaleDateString()} />
            <Fact icon={ListChecks} label="Answered" value={`${answeredCount}/${qna.length}`} />
            <Fact
              icon={ShieldAlert}
              label="Violations"
              value={interview.proctor_violations_count ?? proctorLogsList.length}
              tone={proctorLogsList.length > 0 ? 'text-destructive' : undefined}
            />
            <Fact icon={Video} label="Recording" value={interview.has_video ? 'Yes' : 'None'} />
          </dl>

          <div className="space-y-2 border-t border-border pt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Competencies
            </span>
            {competencies.map((c) => (
              <div key={c.name} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="truncate text-muted-foreground">{c.name}</span>
                  <span className="shrink-0 font-mono font-bold" style={{ color: c.fill }}>
                    {formatScore(c.score)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{
                      width: `${Math.max(0, Math.min(100, c.score || 0))}%`,
                      backgroundColor: c.fill,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ------------------------------------------------------- evidence pane */}
        <section className="flex min-h-0 flex-col print:block">
          <div className="no-print flex shrink-0 gap-1 overflow-x-auto border-b border-border print:hidden">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex shrink-0 cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wide outline-none transition-colors',
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

          <div className="min-h-0 flex-1 overflow-y-auto pt-3 pr-0.5 print:overflow-visible">
            {/* ------------------------------------------------------- analysis */}
            <Panel show={activeTab === 'overview'}>
              <div className="rounded-xl border border-border bg-card p-4 print:break-inside-avoid print:border-slate-300">
                <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  AI Performance Summary
                </h4>
                <p className="text-xs font-medium leading-relaxed text-foreground/80">
                  {interview.feedback_summary ||
                    `Candidate completed the assessment for target role ${interview.job_role}.`}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <PointsCard
                  title="Strengths"
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

              <div className="rounded-xl border border-border bg-card p-4 print:break-inside-avoid print:border-slate-300">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-primary">
                  <BookOpen className="size-4" /> Growth Roadmap
                </h4>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
                  {report.recommendations || 'No specific improvements registered.'}
                </p>
                <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3 print:border-slate-300">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Info className="size-3 text-primary" /> Missing Core Concepts
                  </span>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {report.missing_concepts || 'No missing concepts identified.'}
                  </p>
                </div>
              </div>
            </Panel>

            {/* ------------------------------------------------------ transcript */}
            <Panel show={activeTab === 'transcript'}>
              {qna.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-card p-4 print:break-inside-avoid print:border-slate-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Badge variant="secondary" size="sm">
                        Q{idx + 1}
                      </Badge>
                      <h4 className="mt-1.5 text-sm font-bold leading-snug text-foreground">
                        {item.question.question_text}
                      </h4>
                    </div>
                    {item.response && (
                      <div className="shrink-0 text-right">
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          Score
                        </span>
                        <span
                          className="text-lg font-extrabold"
                          style={{ color: scoreColor(item.response.score) }}
                        >
                          {formatScore(item.response.score)}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 print:border-slate-300">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                      Candidate Answer
                    </span>
                    <p className="mt-1 text-xs font-medium italic leading-relaxed text-foreground/80">
                      &ldquo;{item.response?.response_text || 'No answer recorded.'}&rdquo;
                    </p>
                  </div>

                  {item.response && (
                    <div className="mt-2.5">
                      <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                        AI Grading Feedback
                      </span>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {item.response.feedback}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </Panel>

            {/* -------------------------------------------------------- evidence */}
            <Panel show={activeTab === 'compliance'}>
              {violationSummary.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {violationSummary.map((v) => (
                    <div
                      key={v.type}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 print:border-slate-300"
                    >
                      <Badge variant={VIOLATION_TONE[v.type] || 'secondary'} size="sm">
                        {v.label}
                      </Badge>
                      <span className="font-mono text-sm font-bold text-foreground">{v.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {isAdmin && auditSnapshots.length > 0 ? (
                <div className="no-print h-[26rem] rounded-xl border border-border bg-card p-3 print:hidden">
                  <SnapshotGallery snapshots={auditSnapshots} className="h-full" />
                </div>
              ) : report.snapshot_image ? (
                <div className="rounded-xl border border-border bg-card p-3 print:border-slate-300">
                  <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted">
                    <img src={report.snapshot_image} alt="Integrity breach frame" className="size-full object-contain" />
                    <Badge variant="destructive" size="sm" className="absolute left-2 top-2">
                      Violation Frame
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
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

              <div className="rounded-xl border border-border bg-card print:border-slate-300">
                <h4 className="border-b border-border px-4 py-2.5 text-xs font-bold text-foreground">
                  Integrity Audit Trail
                </h4>
                {proctorLogsList.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {proctorLogsList.map((log, idx) => (
                      <li key={idx} className="flex flex-col gap-1 px-4 py-2.5 text-xs">
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
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="p-8 text-center text-xs italic text-muted-foreground">
                    Zero violation trails logged.
                  </p>
                )}
              </div>
            </Panel>

            {/* ------------------------------------------------------- recording */}
            {showVideo && (
              <Panel show={activeTab === 'recording'} className="no-print print:hidden">
                {videoUrl && !videoPlaybackError ? (
                  <video
                    controls
                    src={videoUrl}
                    className="max-h-[30rem] w-full rounded-xl bg-black"
                    // Playback can fail after load (expired signed URL, codec, dropped
                    // network). Surface it with a retry rather than a frozen player.
                    onError={() =>
                      setVideoPlaybackError('The recording could not be played — the secure link may have expired.')
                    }
                  />
                ) : (
                  <div className="space-y-3 rounded-xl border-2 border-dashed border-border p-10 text-center">
                    <Video className="mx-auto size-8 text-muted-foreground/40" />
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
              </Panel>
            )}

            {/* -------------------------------------------------------- feedback */}
            <Panel show={activeTab === 'feedback'}>
              <div className="rounded-xl border border-border bg-card p-4 print:border-slate-300">
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
              </div>
            </Panel>

            {/* ----------------------------------------------------------- tools */}
            {isAdmin && (
              <Panel show={activeTab === 'admin'} className="no-print print:hidden">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <ToolLink
                    to={`/admin/scoring?interview_id=${interview.id}`}
                    title="LLM Scoring Breakdown"
                    desc="Per-question score, confidence and rationale."
                  />
                  <ToolLink
                    to={`/admin/logs?tab=snapshots&interview_id=${interview.id}`}
                    title="Proctoring Snapshots"
                    desc="Every archived image from this session."
                  />
                  <ToolLink
                    to={`/admin/users/${interview.user_id}`}
                    title="Candidate Profile"
                    desc="Interviews, snapshots and approval history."
                  />
                </div>
              </Panel>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ subviews */

/** Tab panels stay mounted and are hidden with CSS so switching tabs never refetches or
 *  loses form state — and `print:block` makes every panel appear in the printed record. */
const Panel = ({ show, className, children }) => (
  <div className={cn('space-y-3 pb-2', show ? 'block' : 'hidden print:block', className)}>{children}</div>
);

const CenteredCard = ({ children }) => (
  <div className="mx-auto my-10 max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center">
    {children}
  </div>
);

const Fact = ({ icon: Icon, label, value, tone }) => (
  <div className="rounded-lg border border-border bg-muted/40 px-2 py-1.5 print:border-slate-300">
    <dt className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
      <Icon className="size-3" />
      {label}
    </dt>
    <dd className={cn('mt-0.5 text-sm font-bold text-foreground', tone)}>{value}</dd>
  </div>
);

/** Radial score gauge. The arc uses stroke-dashoffset so it animates via a plain CSS
 *  transition — no animation loop, and it prints as a static filled arc. */
const ScoreGauge = ({ score, verdict }) => {
  const radius = 44;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score || 0));
  const offset = circumference - (pct / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative grid size-32 select-none place-items-center">
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
          <span className="text-2xl font-black text-foreground">{formatScore(score)}%</span>
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
  <div className="rounded-xl border border-border bg-card p-4 print:break-inside-avoid print:border-slate-300">
    <h4 className={cn('mb-2 flex items-center gap-2 text-xs font-bold', tone)}>
      <Icon className="size-4" /> {title}
    </h4>
    <ul className="space-y-2 text-xs text-muted-foreground">
      {items.length === 0 ? (
        <li className="italic text-muted-foreground/70">{empty}</li>
      ) : (
        items.map((str, idx) => (
          <li key={idx} className="flex items-start gap-2 leading-relaxed">
            <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', dot)} />
            <span>{str}</span>
          </li>
        ))
      )}
    </ul>
  </div>
);

const ToolLink = ({ to, title, desc }) => (
  <Link
    to={to}
    className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:bg-accent/50"
  >
    <span className="text-xs font-bold text-foreground">{title}</span>
    <span className="text-[10px] leading-relaxed text-muted-foreground">{desc}</span>
  </Link>
);

export default ReportDetailPage;
