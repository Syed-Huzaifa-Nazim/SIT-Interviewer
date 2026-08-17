import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import InterviewFeedbackForm from '../components/feedback/InterviewFeedbackForm';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';
import SnapshotGallery from '../components/report/SnapshotGallery';
import { cn, formatScore } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { Badge } from '@/components/shadcn/badge';
import { scoreColor } from '@/components/shadcn/chart';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Calendar,
  ChevronLeft,
  Clock,
  FileText,
  Flag,
  Info,
  ListChecks,
  MessageSquare,
  PlayCircle,
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
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    let parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') {
      // Double-encoded: the outer parse just unwrapped a string that is itself JSON.
      const inner = parsed.trim();
      if (!inner) return [];
      try {
        parsed = JSON.parse(inner);
      } catch {
        return [inner];
      }
    }
    if (Array.isArray(parsed)) return parsed;
    // Valid JSON but not an array/string (a number, an object, ...) — not a shape any
    // caller expects, so fall through to treating the original text as one item.
    return [trimmed];
  } catch {
    // Not JSON at all — the backend stores these fields as either a JSON-encoded array OR
    // plain prose interchangeably, depending on what the LLM returned for that report (see
    // interview_routes.py's _as_text). Plain prose isn't a malformed record to fall back to
    // [] for — it's real content and must still show up as one item.
    return [trimmed];
  }
};

// mm:ss for the intro-segment bookmark label (Jump to Introduction) — recordings run well
// under an hour, so hours are deliberately not handled.
const formatClockTime = (totalSeconds) => {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const TECHNICAL_NOTE_TYPES = [
  'CAMERA_STALL',
  'CAMERA_UNRECOVERABLE',
  'RECORDING_UNAVAILABLE',
  'RECORDING_TRUNCATED',
];

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

/** One extracted-field list on the admin's Resume panel. */
const ResumeFacts = ({ title, items }) => (
  <div className="rounded-lg border border-border bg-muted/40 p-3">
    <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
      {title} ({items.length})
    </span>
    {items.length === 0 ? (
      <p className="mt-1 text-xs text-muted-foreground">
        Nothing extracted — questions could not be built from this.
      </p>
    ) : (
      <ul className="mt-1.5 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs leading-relaxed text-foreground/80">
            {item}
          </li>
        ))}
      </ul>
    )}
  </div>
);

const ReportDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // window.history.state.idx (set by React Router's data router on every navigate/push) is
  // > 0 whenever there's a real entry to go back to. Checked here instead of location.key
  // ('default' vs not) because location.key resets on a hard refresh — the in-memory router
  // re-mounts fresh — while window.history.state belongs to the browser's own session
  // history for that specific entry and survives a reload of the same page. Back must return
  // to wherever the admin actually came from (Manage Users, the Interviews list, a candidate
  // profile, …) even after a refresh, not just on the very first load of the report.
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  const backFallback = isAdmin ? '/admin/interviews' : '/history';
  const goBack = () => (canGoBack ? navigate(-1) : navigate(backFallback));

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  /* ------------------------------------------------------------- session video */
  const [videoUrl, setVideoUrl] = useState('');
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [videoPlaybackError, setVideoPlaybackError] = useState('');
  const videoRef = useRef(null);
  // Set when "Jump to Introduction" is clicked before the signed video URL has loaded yet —
  // the seek itself happens in onLoadedMetadata once the element actually has a duration.
  const pendingIntroSeekRef = useRef(false);
  // Loading feedback for the Jump button (URL fetch and/or waiting on metadata) and whether
  // playback is currently inside the bookmarked intro range — drives the auto-pause at its
  // end and the "Introduction" badge overlay, both purely cosmetic/UI state.
  const [introSeekPending, setIntroSeekPending] = useState(false);
  const [introPlaybackActive, setIntroPlaybackActive] = useState(false);

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

  /* --------------------------------------------------- resume (Resume-Based only) */
  // The CV this interview's questions were generated from (Resume §4.2). Without it an
  // admin cannot judge whether the questions matched the candidate — the one thing that
  // can go wrong in this category and nowhere else. Fetched only for admins, and only for
  // this interview type, so every other report costs nothing.
  const [resumeData, setResumeData] = useState(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState('');

  const isResumeBased = data?.interview?.type === 'resume_based';
  const candidateId = data?.interview?.user_id;

  useEffect(() => {
    if (!isAdmin || !isResumeBased || !candidateId) return undefined;
    let cancelled = false;
    api
      .get(`/admin/users/${candidateId}/resume`)
      .then((res) => {
        if (!cancelled) setResumeData(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isResumeBased, candidateId]);

  const resumeRecord = resumeData?.resume || null;

  const toggleResumeFlag = useCallback(async (flagged) => {
    if (!resumeRecord) return;
    setFlagBusy(true);
    setFlagError('');
    try {
      const res = await api.post(`/admin/resume-analyses/${resumeRecord.id}/flag`, {
        flagged,
        reason: flagged ? flagReason : undefined,
      });
      setResumeData((prev) => (prev ? { ...prev, resume: res.data.resume } : prev));
      setFlagReason('');
    } catch (err) {
      setFlagError(err.response?.data?.message || 'Could not update the flag.');
    } finally {
      setFlagBusy(false);
    }
  }, [resumeRecord, flagReason]);

  /* ------------------------------------------------------------------ feedback */
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const handleSubmitFeedback = async (values) => {
    setFeedbackLoading(true);
    setFeedbackError('');
    try {
      await api.post('/feedback', { ...values, interview_id: parseInt(id, 10) });
      setFeedbackSubmitted(true);
    } catch (err) {
      // Surfaced rather than only logged: unlike the thank-you screen, nothing else is
      // happening here for the candidate to move on to, so a silent failure would look
      // like the button simply not working.
      console.error('Failed to submit user feedback:', err);
      setFeedbackError(
        err.response?.data?.message || 'Could not send your feedback. Please try again.'
      );
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
        // Seed from the server so the prompt stays hidden on a device or session where this
        // person already rated the interview. Latched with `prev ||` rather than assigned:
        // while scoring is still running this refetches every 3s, and a poll that left
        // before a submission would otherwise land after it and reopen the form. Feedback
        // is never un-submitted, so true is permanent.
        setFeedbackSubmitted((prev) => prev || Boolean(res.data.feedback_submitted));
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

  const allProctorLogs = useMemo(() => asList(data?.interview?.proctor_logs), [data]);

  // The audit trail should read as "what actually counted toward this candidate's strikes".
  // Soft nudges (a glance away that never escalated) are real signal for the proctoring
  // engine but not for a reviewer — one session logged 57 of them, which buried the three
  // events that actually mattered.
  const proctorLogsList = useMemo(() => allProctorLogs.filter((log) => !log.soft), [allProctorLogs]);

  // Infrastructure notes are soft too — never candidate misconduct — but unlike a look-away
  // nudge an admin does need them: they are what explains a missing or truncated recording.
  const technicalNotes = useMemo(
    () => allProctorLogs.filter((log) => log.soft && TECHNICAL_NOTE_TYPES.includes(log.type)),
    [allProctorLogs]
  );

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
  // recommendations/missing_concepts come back from the same LLM report as either a plain
  // string or a JSON array depending on which path generated it — asList() already handles
  // that ambiguity for strengths/weaknesses above; these were being dumped as raw text
  // (literally printing `["a", "b"]`) instead of going through it too.
  const recommendations = asList(report.recommendations);
  const missingConcepts = asList(report.missing_concepts);

  const verdict = interview.is_proctor_failed
    ? { label: 'Audit Fail', variant: 'destructive' }
    : report.overall_score >= 80
      ? { label: 'Distinction Pass', variant: 'success' }
      : report.overall_score >= 60
        ? { label: 'Standard Pass', variant: 'default' }
        : { label: 'Review Required', variant: 'warning' };

  const showVideo = isAdmin && interview.has_video;
  const hasIntroBookmark = showVideo && interview.intro_video_start_seconds != null;

  // Seeks the player to the welcome/rules screen the candidate saw before Question 1 (see
  // backend's mark-intro-segment) — not a separate clip, just a timestamp inside the one
  // session recording. Checking readyState matters: a <video> ignores/resets a currentTime
  // set before its metadata has loaded, so seeking immediately on a freshly-mounted element
  // silently failed and the video just played from 0 — the "takes forever to get there" bug.
  // Deferring to onLoadedMetadata (below) whenever metadata isn't ready yet is what fixes it.
  const jumpToIntro = () => {
    if (!hasIntroBookmark) return;
    const video = videoRef.current;
    if (videoUrl && video && video.readyState >= 1) {
      video.currentTime = interview.intro_video_start_seconds;
      video.play().catch(() => {});
      setIntroPlaybackActive(true);
    } else {
      pendingIntroSeekRef.current = true;
      setIntroSeekPending(true);
      if (!videoUrl) loadSessionVideo();
    }
  };

  const answeredCount = qna.filter((q) => q.response).length;

  const competencies = [
    { name: 'Technical', score: report.technical_score },
    { name: 'Communication', score: report.communication_score },
    { name: 'Confidence', score: report.confidence_score },
    { name: 'Problem Solving', score: report.problem_solving_score },
  ].map((c) => ({ ...c, fill: scoreColor(c.score) }));

  // The candidate whose interview this is, and who hasn't rated it yet.
  const showFeedbackPrompt = !isAdmin && !feedbackSubmitted;

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
    // Only for a Resume-Based interview, and only once the CV has loaded — an empty tab
    // would just raise the question of where the resume went.
    ...(isAdmin && isResumeBased && resumeRecord
      ? [{
          id: 'resume',
          label: 'Resume',
          icon: FileText,
          badge: resumeRecord.flagged_at ? '!' : null,
          danger: !!resumeRecord.flagged_at,
        }]
      : []),
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
      {/* A letterhead, not just a page title: brand mark, report identity, and the verdict
          the reader actually opens this document to see — all above the fold, before they
          scroll into the section-by-section detail below. */}
      <div className="hidden print:mb-4 print:block">
        <div style={{ borderBottom: '3px solid #0d6db7' }} className="flex items-end justify-between pb-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#0d6db7' }}>
              SMIT Assessment Portal
            </span>
            <h1 className="text-2xl font-black leading-tight tracking-tight text-black">
              Candidate Assessment Report
            </h1>
          </div>
          <div className="text-right text-[10px] text-slate-500">
            <div>Interview #{interview.id}</div>
            <div>Generated {new Date().toLocaleDateString()}</div>
          </div>
        </div>

        {/* Role, track, date, score and verdict are deliberately NOT repeated here — the
            summary rail printed immediately below (ScoreGauge, via the grid's print:block)
            already leads with all of it; restating the same facts above the fold would read
            as padding, not polish. This band exists only for what nothing else shows: the
            document identity. */}
      </div>

      {/* -------------------------------------------------------------- toolbar */}
      <div className="no-print flex shrink-0 items-center justify-between gap-3 print:hidden">
        {/* Returns to wherever the admin actually came from (Manage Users, a candidate
            profile, the Interviews list, …) instead of always landing back on Interviews —
            a plain history back, with a sensible fallback for a direct/bookmarked visit that
            has nowhere to go back to. */}
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ChevronLeft />
          Back
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
        {/* min-w-0 matters here, not just min-h-0: a grid/flex item defaults to
            min-width:auto, which refuses to shrink below its content's natural width. Without
            it, the tab strip's overflow-x-auto never actually triggers — instead of clipping
            and scrolling internally, this whole column just grows wider than the grid track
            to fit every tab, so the custom slider below the tabs correctly measures "not
            overflowing" (nothing is) even though tabs visibly run off the right edge. */}
        <section className="flex min-h-0 min-w-0 flex-col print:block">
          {/* Post-interview feedback, asked up front rather than left in the Remarks tab.
              One-time candidates get this on their thank-you screen, but enrolled candidates
              never see that screen — they land here, and a form buried behind one of six tabs
              meant that half of the intake was effectively never asked.

              Only for the candidate whose interview this is, and only until they answer:
              feedback_submitted comes from the server, so it stays answered across devices
              and re-logins. An admin reviewing someone else's report is not the person being
              asked, and the Remarks tab is still there for them. */}
          {showFeedbackPrompt && (
            <div className="no-print mb-3 shrink-0 rounded-xl border border-primary/30 bg-primary/5 p-4 print:hidden">
              <div className="mb-3 flex items-start gap-2.5">
                <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-foreground">How was your interview?</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Optional, and never shown to anyone assessing you. It only helps us improve
                    the platform.
                  </p>
                </div>
              </div>
              {feedbackError && (
                <Alert variant="error" className="mb-3 text-xs">
                  {feedbackError}
                </Alert>
              )}
              <InterviewFeedbackForm
                onSubmit={handleSubmitFeedback}
                submitting={feedbackLoading}
                compact
              />
            </div>
          )}

          {/* Custom always-visible slider (see HScrollSlider) instead of relying on the
              native scrollbar, which some browser/OS combinations hide until hovered or
              suppress outright — the strip overflows on most screens once every tab (up to
              Recording + Tools) is in play. */}
          <HScrollSlider className="no-print shrink-0 border-b border-border pb-1 print:hidden">
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
          </HScrollSlider>

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
                {recommendations.length === 0 ? (
                  <p className="text-xs italic leading-relaxed text-muted-foreground">
                    No specific improvements registered.
                  </p>
                ) : (
                  <ul className="space-y-2 text-xs text-foreground/80">
                    {recommendations.map((str, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3 print:border-slate-300">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Info className="size-3 text-primary" /> Missing Core Concepts
                  </span>
                  {missingConcepts.length === 0 ? (
                    <p className="mt-1 text-xs italic leading-relaxed text-muted-foreground">
                      No missing concepts identified.
                    </p>
                  ) : (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {missingConcepts.map((str, idx) => (
                        <li
                          key={idx}
                          className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {str}
                        </li>
                      ))}
                    </ul>
                  )}
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
                      {/* Resume-to-question traceability (Resume §4.2). Only on this
                          category, and only for admins: it exists so a reviewer can tell
                          whether the generator worked off the CV or invented a connection
                          to it, which is a failure mode no other category has. A question
                          with no source is shown as such rather than left blank — the
                          absence IS the finding. */}
                      {isAdmin && isResumeBased && item.question.question_type !== 'coding_sandbox' && (
                        item.question.derived_from ? (
                          <p className="mt-1.5 flex items-start gap-1.5 text-[10px] font-semibold text-muted-foreground">
                            <FileText className="mt-px size-3 shrink-0 text-primary" />
                            <span className="min-w-0">
                              From resume: <span className="text-foreground/80">{item.question.derived_from}</span>
                            </span>
                          </p>
                        ) : (
                          <p className="mt-1.5 flex items-start gap-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="mt-px size-3 shrink-0" />
                            <span>Not traceable to any skill or project on the resume</span>
                          </p>
                        )
                      )}
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

            {/* ---------------------------------------------------------- resume */}
            {isAdmin && isResumeBased && resumeRecord && (
              <Panel show={activeTab === 'resume'}>
                {resumeRecord.flagged_at && (
                  <Alert variant="warning">
                    <b>Flagged as poorly parsed</b>
                    {resumeRecord.flag_reason ? ` — ${resumeRecord.flag_reason}` : ''}
                    {resumeData?.flagged_by_name ? ` (${resumeData.flagged_by_name})` : ''}
                  </Alert>
                )}

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-xs font-bold text-primary">
                      <FileText className="size-4" /> {resumeRecord.file_name}
                    </h4>
                    <Badge variant="secondary" size="sm">ATS {resumeRecord.resume_score}%</Badge>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ResumeFacts title="Skills" items={asList(resumeRecord.extracted_skills)} />
                    <ResumeFacts title="Projects" items={asList(resumeRecord.extracted_projects)} />
                  </div>
                </div>

                {/* The uploaded file is never retained, so this text IS the document as the
                    question generator saw it — which is exactly what makes it useful for
                    checking a question against its source. */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-primary">
                    <BookOpen className="size-4" /> Resume text
                  </h4>
                  {resumeRecord.raw_text ? (
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 font-sans text-xs leading-relaxed text-foreground/80">
                      {resumeRecord.raw_text}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This resume was analysed before the full text was retained, so only the
                      extracted skills and projects above are available.
                    </p>
                  )}
                </div>

                {/* Operational signal only — nothing branches on it. It is here so a garbled
                    PDF is recorded as the cause of a weak interview rather than being
                    mistaken for a weak candidate. */}
                <div className="rounded-xl border border-border bg-card p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-primary">
                    <Flag className="size-4" /> Analysis quality
                  </h4>
                  {flagError && <Alert variant="error">{flagError}</Alert>}

                  {resumeRecord.flagged_at ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={flagBusy}
                      onClick={() => toggleResumeFlag(false)}
                    >
                      Clear this flag
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        If the extraction above misread the CV — garbled text, missed skills,
                        projects not picked up — record it here.
                      </p>
                      <textarea
                        value={flagReason}
                        onChange={(e) => setFlagReason(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="What did the analysis get wrong?"
                        className="w-full rounded-lg border border-border bg-muted/40 p-2 text-xs text-foreground"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={flagBusy || !flagReason.trim()}
                        onClick={() => toggleResumeFlag(true)}
                      >
                        <Flag className="size-3.5" /> Flag this analysis
                      </Button>
                    </div>
                  )}
                </div>
              </Panel>
            )}

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

                {technicalNotes.length > 0 && (
                  <div className="border-t border-border px-4 py-3">
                    <h5 className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                      Technical Notes
                    </h5>
                    <ul className="space-y-1.5">
                      {technicalNotes.map((log, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                          <span className="shrink-0 pt-0.5 font-mono text-[10px] opacity-70">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span>{log.details}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Panel>

            {/* ------------------------------------------------------- recording */}
            {showVideo && (
              <Panel show={activeTab === 'recording'} className="no-print print:hidden">
                {videoUrl && !videoPlaybackError ? (
                  <>
                    <div className="relative">
                      <video
                        ref={videoRef}
                        controls
                        src={videoUrl}
                        className="max-h-[30rem] w-full rounded-xl bg-black"
                        // Playback can fail after load (expired signed URL, codec, dropped
                        // network). Surface it with a retry rather than a frozen player.
                        onError={() => {
                          pendingIntroSeekRef.current = false;
                          setIntroSeekPending(false);
                          setVideoPlaybackError('The recording could not be played — the secure link may have expired.');
                        }}
                        onLoadedMetadata={() => {
                          if (!pendingIntroSeekRef.current) return;
                          pendingIntroSeekRef.current = false;
                          setIntroSeekPending(false);
                          const video = videoRef.current;
                          if (video) {
                            video.currentTime = interview.intro_video_start_seconds;
                            video.play().catch(() => {});
                            setIntroPlaybackActive(true);
                          }
                        }}
                        // Auto-stop at the end of the bookmarked range so "Jump to
                        // Introduction" plays just that screen instead of running on into
                        // the rest of the interview. Only active right after a jump — once
                        // it fires once it clears itself, so normal playback/scrubbing
                        // afterwards is never held back by it.
                        onTimeUpdate={() => {
                          if (!introPlaybackActive) return;
                          const video = videoRef.current;
                          if (video && video.currentTime >= interview.intro_video_end_seconds) {
                            video.pause();
                            setIntroPlaybackActive(false);
                          }
                        }}
                      />
                      {introPlaybackActive && (
                        <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow-lg">
                          <PlayCircle className="size-3" />
                          Introduction
                        </span>
                      )}
                    </div>
                    {hasIntroBookmark && (
                      <Button size="sm" variant="outline" disabled={introSeekPending} onClick={jumpToIntro} className="gap-1.5">
                        <PlayCircle className="size-3.5" />
                        {introSeekPending ? 'Loading Introduction…' : (
                          <>
                            Jump to Introduction
                            <span className="text-muted-foreground">
                              ({formatClockTime(interview.intro_video_start_seconds)}–{formatClockTime(interview.intro_video_end_seconds)})
                            </span>
                          </>
                        )}
                      </Button>
                    )}
                  </>
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
                    <div className="flex flex-wrap items-center justify-center gap-2">
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
                      {hasIntroBookmark && (
                        <Button size="sm" variant="outline" disabled={videoLoading || introSeekPending} onClick={jumpToIntro} className="gap-1.5">
                          <PlayCircle className="size-3.5" />
                          {videoLoading || introSeekPending ? 'Loading Introduction…' : 'Jump to Introduction'}
                        </Button>
                      )}
                    </div>
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
                ) : showFeedbackPrompt ? (
                  // The same form is already open at the top of this pane, so pointing at it
                  // beats rendering a second copy that shares its state and would confuse
                  // anyone who filled one and saw the other change with it.
                  <p className="text-xs text-muted-foreground">
                    The feedback form is at the top of this page.
                  </p>
                ) : (
                  <>
                    {feedbackError && (
                      <Alert variant="error" className="mb-3 text-xs">
                        {feedbackError}
                      </Alert>
                    )}
                    <InterviewFeedbackForm
                      onSubmit={handleSubmitFeedback}
                      submitting={feedbackLoading}
                      compact
                    />
                  </>
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

      {/* --------------------------------------------------------- print footer */}
      <div className="hidden print:mt-6 print:block print:border-t print:border-slate-200 print:pt-2">
        <p className="text-center text-[9px] uppercase tracking-widest text-slate-400">
          Confidential — SMIT Assessment Portal · Interview #{interview.id} · For internal review only
        </p>
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

/** A horizontally-scrolling strip with its own always-visible, draggable slider underneath —
 *  used for the tab bar, which otherwise relies on the OS/browser's native scrollbar to hint
 *  that there's more to scroll to. Native scrollbars are exactly the kind of thing that's
 *  invisible-until-hovered or entirely suppressed depending on OS settings (Windows' "only
 *  show scrollbars while scrolling", macOS overlay scrollbars, …) — this renders its own, so
 *  it looks and behaves the same everywhere. Hidden entirely when the content already fits. */
const HScrollSlider = ({ children, className }) => {
  const containerRef = useRef(null);
  const [metrics, setMetrics] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 });
  const draggingRef = useRef(false);

  const updateMetrics = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setMetrics({ scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    updateMetrics();
    const ro = new ResizeObserver(updateMetrics);
    ro.observe(el);
    el.addEventListener('scroll', updateMetrics, { passive: true });
    window.addEventListener('resize', updateMetrics);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', updateMetrics);
      window.removeEventListener('resize', updateMetrics);
    };
    // children affects scrollWidth (e.g. the Evidence badge count changing tab widths).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateMetrics, children]);

  const overflowing = metrics.scrollWidth > metrics.clientWidth + 1;
  const maxScroll = Math.max(1, metrics.scrollWidth - metrics.clientWidth);
  const thumbWidthPct = overflowing ? Math.max(10, (metrics.clientWidth / metrics.scrollWidth) * 100) : 100;
  const thumbLeftPct = overflowing ? (metrics.scrollLeft / maxScroll) * (100 - thumbWidthPct) : 0;

  const seekToClientX = (clientX, track) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    el.scrollLeft = ratio * (el.scrollWidth - el.clientWidth);
  };

  const onTrackPointerDown = (e) => {
    const track = e.currentTarget;
    draggingRef.current = true;
    seekToClientX(e.clientX, track);
    const onMove = (ev) => {
      if (draggingRef.current) seekToClientX(ev.clientX, track);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="flex min-w-0 gap-1 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {overflowing && (
        <div
          onPointerDown={onTrackPointerDown}
          role="scrollbar"
          aria-orientation="horizontal"
          className="relative mt-1.5 h-2.5 w-full cursor-pointer rounded-full bg-slate-200 dark:bg-slate-800"
        >
          <div
            className="absolute inset-y-0 cursor-grab rounded-full bg-primary/70 transition-colors hover:bg-primary active:cursor-grabbing"
            style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
          />
        </div>
      )}
    </div>
  );
};

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
