import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import Card, { CardTitle } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import {
  Award,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Printer,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Info,
  ShieldAlert,
  MessageSquare,
  Activity,
  UserCheck,
  X
} from 'lucide-react';

const ReportDetailPage = () => {
  const { id } = useParams();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // overview, transcript, compliance, feedback

  // Session recording playback (DB Integration §2.2) — admin only, via a short-lived
  // signed URL into the private interview-recordings bucket.
  const [videoUrl, setVideoUrl] = useState('');
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState('');
  // Playback-level failure (distinct from the fetch error above): fires when the <video>
  // element itself can't play the stream — e.g. the short-lived signed URL expired mid-view,
  // a codec issue, or the network dropped. Retrying re-fetches a fresh signed URL.
  const [videoPlaybackError, setVideoPlaybackError] = useState('');

  const loadSessionVideo = async () => {
    setVideoLoading(true);
    setVideoError('');
    setVideoPlaybackError('');
    try {
      const res = await api.get(`/admin/interviews/${id}/video-url`);
      setVideoUrl(res.data.video_url);
    } catch (err) {
      setVideoError(err.response?.data?.detail || 'Could not load the session recording.');
    } finally {
      setVideoLoading(false);
    }
  };

  // Integrity Audit Trail → snapshot gallery (admin only): every archived webcam/screen
  // capture for this specific interview, browsable via a slider. Loaded once the report
  // arrives so clicking any audit log entry can jump straight to its closest-in-time snapshot.
  const [auditSnapshots, setAuditSnapshots] = useState([]);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [snapshotUrlCache, setSnapshotUrlCache] = useState({});
  const [snapshotUrlLoading, setSnapshotUrlLoading] = useState(false);
  const [snapshotUrlError, setSnapshotUrlError] = useState('');

  useEffect(() => {
    if (!data || user?.role !== 'admin') return;
    let cancelled = false;
    api.get('/admin/proctor-snapshots', { params: { interview_id: data.interview.id } })
      .then((res) => { if (!cancelled) setAuditSnapshots(res.data || []); })
      .catch(() => { if (!cancelled) setAuditSnapshots([]); });
    return () => { cancelled = true; };
  }, [data, user?.role]);

  // Fetch (and cache) the short-lived signed URL for whichever snapshot is on screen.
  useEffect(() => {
    if (!snapshotModalOpen) return;
    const snap = auditSnapshots[snapshotIndex];
    if (!snap || snapshotUrlCache[snap.id]) return;
    setSnapshotUrlLoading(true);
    setSnapshotUrlError('');
    api.get(`/admin/proctor-snapshots/${snap.id}/url`)
      .then((res) => setSnapshotUrlCache((prev) => ({ ...prev, [snap.id]: res.data.image_url })))
      .catch(() => setSnapshotUrlError('Could not load this snapshot image.'))
      .finally(() => setSnapshotUrlLoading(false));
  }, [snapshotModalOpen, snapshotIndex, auditSnapshots, snapshotUrlCache]);

  // Thumbnail strip on the Compliance tab (replaces the old single giant image) — shows
  // only the webcam frame ('webcam' kind) per counted violation, one thumbnail per
  // violation, so the count here matches the candidate's actual strike count instead of
  // also including the paired screen-share capture for each one. The full mixed gallery
  // (webcam + screen + identity) is still reachable via "View all N snapshots" below.
  const THUMB_COUNT = 5;
  const webcamSnapshots = auditSnapshots.filter((s) => s.kind === 'webcam');
  const [thumbUrlCache, setThumbUrlCache] = useState({});
  useEffect(() => {
    if (webcamSnapshots.length === 0) return;
    const toFetch = webcamSnapshots.slice(0, THUMB_COUNT).filter((s) => !thumbUrlCache[s.id]);
    toFetch.forEach((snap) => {
      api.get(`/admin/proctor-snapshots/${snap.id}/url`)
        .then((res) => setThumbUrlCache((prev) => ({ ...prev, [snap.id]: res.data.image_url })))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditSnapshots]);

  // Jump the slider to whichever archived snapshot was captured closest in time to the
  // clicked audit-log entry — logs and snapshots aren't directly linked by ID, but both
  // carry timestamps, so nearest-in-time is the closest honest match.
  const openSnapshotModal = (log) => {
    if (auditSnapshots.length > 0) {
      const logTime = new Date(log.timestamp).getTime();
      let bestIdx = 0;
      let bestDiff = Infinity;
      auditSnapshots.forEach((s, i) => {
        const diff = Math.abs(new Date(s.captured_at).getTime() - logTime);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      });
      setSnapshotIndex(bestIdx);
    } else {
      setSnapshotIndex(0);
    }
    setSnapshotModalOpen(true);
  };

  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [issuesReported, setIssuesReported] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pollId = null;

    const fetchReport = async () => {
      try {
        const res = await api.get(`/interviews/${id}/report`);
        if (cancelled) return;
        setData(res.data);
        setError('');
        // Scoring now runs in the background (Perf §1.6): if the report isn't ready yet,
        // keep polling until it lands, then stop.
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

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    setFeedbackLoading(true);
    try {
      await api.post('/feedback', {
        rating,
        feedback_text: feedbackText,
        issues_reported: issuesReported,
        interview_id: parseInt(id)
      });
      setFeedbackSubmitted(true);
    } catch (err) {
      console.error('Failed to submit user feedback:', err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Spinner size="lg" label="Generating detailed performance report..." />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="text-center max-w-md mx-auto space-y-4 my-10">
        <AlertCircle className="mx-auto text-red-500" size={32} />
        <h3 className="font-bold text-lg text-slate-900 dark:text-white">Error Loading Report</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">{error || 'Report details could not be found.'}</p>
        <Link to={user?.role === 'admin' ? '/admin/interviews' : '/dashboard'}>
          <Button size="sm">{user?.role === 'admin' ? 'Back to Mock Sessions Auditor' : 'Back to Dashboard'}</Button>
        </Link>
      </Card>
    );
  }

  // Scoring in progress (Perf §1.6): the interview is finished but the AI is still grading
  // the answers and assembling the report in the background. The effect above polls until
  // this resolves, so this view swaps itself for the full scorecard automatically.
  if (!data.report) {
    return (
      <Card className="text-center max-w-md mx-auto space-y-4 my-10">
        <div className="p-4 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-2xl w-fit mx-auto shadow-lg">
          <Activity className="text-white animate-pulse" size={28} />
        </div>
        <h3 className="font-bold text-lg text-slate-900 dark:text-white">Scoring in progress</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
          Your interview is complete. Our AI is grading each answer and assembling your
          detailed scorecard now — this page will update automatically in a few moments.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-primary-600 dark:text-primary-400">
          <Spinner size="sm" />
          <span>Evaluating responses…</span>
        </div>
      </Card>
    );
  }

  const { interview, report, qna } = data;

  let strengths = [];
  try {
    if (Array.isArray(report.strengths)) {
      strengths = report.strengths;
    } else {
      strengths = JSON.parse(report.strengths || '[]');
      if (typeof strengths === 'string') {
        strengths = JSON.parse(strengths || '[]');
      }
    }
    if (!Array.isArray(strengths)) strengths = [];
  } catch (err) {
    strengths = [];
  }

  let weaknesses = [];
  try {
    if (Array.isArray(report.weaknesses)) {
      weaknesses = report.weaknesses;
    } else {
      weaknesses = JSON.parse(report.weaknesses || '[]');
      if (typeof weaknesses === 'string') {
        weaknesses = JSON.parse(weaknesses || '[]');
      }
    }
    if (!Array.isArray(weaknesses)) weaknesses = [];
  } catch (err) {
    weaknesses = [];
  }

  let proctorLogsList = [];
  let technicalNotesList = [];
  try {
    const rawLogs = interview.proctor_logs;
    let allLogs = [];
    if (Array.isArray(rawLogs)) {
      allLogs = rawLogs;
    } else if (rawLogs) {
      if (typeof rawLogs === 'string') {
        allLogs = JSON.parse(rawLogs || '[]');
        if (typeof allLogs === 'string') {
          allLogs = JSON.parse(allLogs || '[]');
        }
      } else {
        allLogs = rawLogs;
      }
    }
    if (!Array.isArray(allLogs)) {
      allLogs = [];
    }
    // The Integrity Audit Trail should read as "what actually counted toward this
    // candidate's strikes" — soft nudges (a candidate glancing away that never escalated)
    // are real signal for the proctoring system but not for this list, so they're filtered
    // out here rather than cluttering the trail with entries that were never violations.
    proctorLogsList = allLogs.filter((log) => !log.soft);
    // Infrastructure notes (camera dropped/reconnected, recording never captured) are also
    // soft — never candidate misconduct — but unlike a look-away nudge they ARE something an
    // admin needs to see (they explain a missing/gap recording), so they get their own small
    // section below instead of being silently dropped along with the other soft entries.
    const TECHNICAL_NOTE_TYPES = [
      'CAMERA_STALL', 'CAMERA_UNRECOVERABLE', 'RECORDING_UNAVAILABLE', 'RECORDING_TRUNCATED',
    ];
    technicalNotesList = allLogs.filter((log) => log.soft && TECHNICAL_NOTE_TYPES.includes(log.type));
  } catch (err) {
    console.warn("Failed to parse proctor logs:", err);
    proctorLogsList = [];
    technicalNotesList = [];
  }

  // Color mappings
  const getLogBadgeVariant = (type) => {
    if (type === 'NO_FACE') return 'error';
    if (type === 'TAB_SWITCH' || type === 'FOCUS_LOSS') return 'info';
    if (type === 'LOOK_AWAY') return 'warning';
    if (type === 'MULTIPLE_FACES') return 'primary';
    if (type === 'MULTIPLE_HANDS') return 'error';
    if (type === 'KEYBOARD_SHORTCUT') return 'warning';
    return 'default';
  };

  const getVerdict = (score) => {
    if (interview.is_proctor_failed) return { label: 'Audit Fail', color: 'bg-red-500/10 text-red-500 border-red-500/30' };
    if (score >= 80) return { label: 'Distinction Pass', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };
    if (score >= 60) return { label: 'Standard Pass', color: 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/30' };
    return { label: 'Review Required', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' };
  };

  const verdict = getVerdict(report.overall_score);

  // Whether the Session Recording card renders at all — drives whether it sits inline
  // next to the Webcam Audit snapshot card, or the snapshot card takes the full width.
  const showVideoCard = user?.role === 'admin' && interview.has_video;

  // SVG Radial Gauge Geometry
  const radius = 42;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (report.overall_score / 100) * circumference;

  // Recharts sub-scores
  const chartData = [
    { name: 'Technical Depth', score: report.technical_score, fill: '#0d6db7' },
    { name: 'Communication', score: report.communication_score, fill: '#8dc63f' },
    { name: 'Confidence', score: report.confidence_score, fill: '#6366f1' },
    { name: 'Problem Solving', score: report.problem_solving_score, fill: '#f59e0b' }
  ];

  return (
    <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto animate-fade-in print:max-w-none print:space-y-6 print:text-black print:bg-white pb-10">
      
      {/* Print-only Header */}
      <div className="hidden print:block print:pb-4 print:border-b print:border-slate-300">
        <h1 className="text-2xl font-black text-black uppercase tracking-tight">
          SMIT Assessment Scorecard
        </h1>
        <p className="text-xs text-slate-600 mt-1">
          Candidate Evaluation Record · {interview.job_role} · {new Date(interview.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Screen Control Toolbar */}
      <div className="no-print flex items-center justify-between gap-4">
        <Link
          to={user?.role === 'admin' ? '/admin/interviews' : '/history'}
          className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition text-xs font-bold"
        >
          <ChevronLeft size={16} />
          {user?.role === 'admin' ? 'Back to Mock Sessions Auditor' : 'Back to Assessment History'}
        </Link>

        <Button variant="secondary" size="sm" icon={Printer} onClick={handlePrint}>
          Print Scorecard
        </Button>
      </div>

      {/* Proctoring failure alert banner */}
      {interview.is_proctor_failed && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-start gap-3 print:border-red-300">
          <ShieldAlert size={20} className="shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Proctor Violation Terminated Session</h3>
            <p className="leading-relaxed opacity-95">
              This candidate assessment was terminated automatically because the system logged 5 or more proctor compliance infractions. Score metrics should be verified alongside audit snapshot logs.
            </p>
          </div>
        </div>
      )}

      {/* Dashboard Scorecard Hero Section */}
      <Card className="p-6 md:p-8 relative overflow-hidden print:break-inside-avoid print:shadow-none print:border-slate-300">
        <div className="absolute top-[-30%] right-[-10%] w-96 h-96 bg-primary-600/5 rounded-full blur-3xl pointer-events-none print:hidden" />
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
          {/* Circular Gauge */}
          <div className="flex flex-col items-center justify-center text-center space-y-4 md:border-r border-slate-200 dark:border-slate-800/80 pr-4 print:border-slate-300">
            <div className="relative w-36 h-36 flex items-center justify-center select-none">
              <svg className="w-32 h-32 -rotate-90">
                <circle
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth={strokeWidth}
                  stroke="currentColor"
                  fill="transparent"
                  r={radius}
                  cx="64"
                  cy="64"
                />
                <circle
                  className={`${report.overall_score >= 80 ? 'text-accent-500' : report.overall_score >= 60 ? 'text-primary-600' : 'text-amber-500'} transition-all duration-1000 ease-out`}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r={radius}
                  cx="64"
                  cy="64"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{report.overall_score}%</span>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Overall Score</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide uppercase ${verdict.color}`}>
                {verdict.label}
              </span>
            </div>
          </div>

          {/* Performance Summary Text */}
          <div className="md:col-span-2 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="primary" className="!normal-case tracking-normal rounded font-bold">
                  {interview.type} Assessment
                </Badge>
                <Badge variant="default" className="!normal-case tracking-normal rounded font-bold">
                  {interview.difficulty} Level
                </Badge>
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white capitalize">
                {interview.job_role} Candidate Scorecard
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-semibold font-sans">
                <Calendar size={14} className="text-slate-400" />
                <span>Completed: {new Date(interview.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-sans">AI Performance Summary</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans font-medium">
                {interview.feedback_summary || `Candidate completed the mock assessment for target role ${interview.job_role}. Grading metrics reflect correct conceptual coverage and verbal delivery checks.`}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Screen Tabs Toolbar — hidden in print */}
      <div className="no-print border-b border-slate-200 dark:border-slate-800/80 flex gap-6 overflow-x-auto select-none">
        {[
          { id: 'overview', label: 'Overview Metrics', icon: Activity },
          { id: 'transcript', label: 'Q&A Transcript', icon: BookOpen },
          { id: 'compliance', label: 'Compliance Audit', icon: ShieldAlert, badge: proctorLogsList.length || (interview.is_proctor_failed ? '!' : null) },
          { id: 'feedback', label: 'User Remarks', icon: MessageSquare },
          ...(user?.role === 'admin' ? [{ id: 'admin', label: 'Admin Tools', icon: UserCheck }] : []),
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-3.5 text-xs font-bold uppercase tracking-wider border-b-[2px] transition-all cursor-pointer whitespace-nowrap ${
                isActive 
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== null && tab.badge !== 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${tab.id === 'compliance' ? 'bg-red-500/10 text-red-500' : 'bg-primary-500/10 text-primary-500'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW METRICS */}
      <div className={`space-y-6 ${activeTab === 'overview' ? 'block' : 'hidden print:block'}`}>
        
        {/* Sub-scores Chart and List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {/* Subscores Bar Chart */}
          <Card className="lg:col-span-2 space-y-4 print:break-inside-avoid print:shadow-none print:border-slate-300">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800/80 pb-3">
              Competency Breakdown
            </h3>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    fontWeight="bold"
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-slate-900 border border-slate-800 p-2 rounded-lg text-xs text-white">
                            <span className="font-bold">{payload[0].payload.name}: </span>
                            <span className="font-mono text-primary-400 font-bold">{payload[0].value}%</span>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={10}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Subscore Value cards list */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
            {chartData.map((item, idx) => (
              <Card key={idx} className="flex flex-col justify-center p-4 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-800 transition">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide font-sans">{item.name}</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-xl font-extrabold text-slate-900 dark:text-white">{item.score}%</span>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.fill }} />
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:break-inside-avoid">
          <Card className="space-y-4 print:shadow-none print:border-slate-300">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold border-b border-slate-200 dark:border-slate-800 pb-3 print:border-slate-300">
              <ThumbsUp size={16} />
              <h4 className="text-sm">Identified Technical Strengths</h4>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
              {strengths.length === 0 ? (
                <li className="text-slate-400 dark:text-slate-500 italic">No specific strengths parsed.</li>
              ) : (
                strengths.map((str, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 leading-relaxed font-sans">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                    <span>{str}</span>
                  </li>
                ))
              )}
            </ul>
          </Card>

          <Card className="space-y-4 print:shadow-none print:border-slate-300">
            <div className="flex items-center gap-2 text-red-500 dark:text-red-400 font-bold border-b border-slate-200 dark:border-slate-800 pb-3 print:border-slate-300">
              <ThumbsDown size={16} />
              <h4 className="text-sm">Identified Areas of Deficiencies</h4>
            </div>
            <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
              {weaknesses.length === 0 ? (
                <li className="text-slate-400 dark:text-slate-500 italic">No major deficiencies identified. Excellent job!</li>
              ) : (
                weaknesses.map((weak, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 leading-relaxed font-sans">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 shrink-0" />
                    <span>{weak}</span>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>

        {/* AI Recommendations */}
        <Card className="p-6 md:p-8 space-y-6 print:break-inside-avoid print:shadow-none print:border-slate-300">
          <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 font-bold border-b border-slate-200 dark:border-slate-800 pb-3 print:border-slate-300">
            <BookOpen size={18} />
            <h3 className="text-sm uppercase tracking-wide">Candidate Growth Roadmap</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Actionable Steps</span>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                {report.recommendations || 'No specific improvements registered.'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 print:border-slate-300">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">
                <Info size={12} className="text-primary-500" />
                Missing Core Concepts
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                {report.missing_concepts || 'No missing concepts identified.'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* TAB 2: DETAILED TRANSCRIPT */}
      <div className={`space-y-6 ${activeTab === 'transcript' ? 'block' : 'hidden print:block'}`}>
        <div className="space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-2 print:border-slate-300">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
              Graded Q&A Log
            </h3>
          </div>
          <div className="space-y-4 md:space-y-6">
            {qna.map((item, idx) => (
              <Card key={idx} className="p-5 space-y-4 print:break-inside-avoid print:shadow-none print:border-slate-300">
                <div className="space-y-1.5">
                  <Badge variant="primary" className="!text-[9px] rounded font-bold normal-case tracking-normal">
                    Question {idx + 1}
                  </Badge>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm leading-snug font-sans">
                    {item.question.question_text}
                  </h4>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 print:border-slate-300">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide font-sans">Verbal Transcript</span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic font-sans font-medium">
                    &ldquo;{item.response?.response_text || 'No verbal answer recorded.'}&rdquo;
                  </p>
                </div>

                {item.response && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start pt-2">
                    <div className="md:col-span-3 space-y-1">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide font-sans">AI Grading Feedback</span>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
                        {item.response.feedback}
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-0.5 print:border-slate-300">
                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Score</span>
                      <span className={`text-base font-extrabold block font-sans ${
                        item.response.score >= 80 ? 'text-accent-500' : item.response.score >= 60 ? 'text-primary-600' : 'text-amber-500'
                      }`}>
                        {item.response.score}%
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* TAB 3: COMPLIANCE & AUDIT */}
      <div className={`space-y-6 ${activeTab === 'compliance' ? 'block' : 'hidden print:block'}`}>
        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 items-start`}>
          {/* Webcam Audit snapshot — sits inline with Session Recording when both are
              present; otherwise takes the space Session Recording would have used. */}
          <Card className={`space-y-4 print:shadow-none print:border-slate-300 ${showVideoCard ? '' : 'lg:col-span-2'}`}>
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800/80 pb-3 print:border-slate-300">
              Webcam Audit snapshot
            </h3>
            {user?.role === 'admin' && auditSnapshots.length > 0 ? (
              // Admin view: one webcam thumbnail per counted violation (not the paired
              // screen capture too) — click any thumbnail to open it full-size in the
              // slider gallery below, which still includes everything archived.
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {webcamSnapshots.slice(0, THUMB_COUNT).map((snap) => (
                    <button
                      key={snap.id}
                      type="button"
                      onClick={() => {
                        const realIdx = auditSnapshots.findIndex((a) => a.id === snap.id);
                        setSnapshotIndex(realIdx >= 0 ? realIdx : 0);
                        setSnapshotModalOpen(true);
                      }}
                      className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 hover:border-primary-400 dark:hover:border-primary-600 transition"
                      title={`Webcam · ${new Date(snap.captured_at).toLocaleTimeString()}`}
                    >
                      {thumbUrlCache[snap.id] ? (
                        <img src={thumbUrlCache[snap.id]} alt="Archived proctoring thumbnail" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Spinner size="sm" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => { setSnapshotIndex(0); setSnapshotModalOpen(true); }}
                  className="text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:underline"
                >
                  {auditSnapshots.length > Math.min(webcamSnapshots.length, THUMB_COUNT)
                    ? `View all ${auditSnapshots.length} snapshots →`
                    : 'Open in full-size viewer →'}
                </button>
              </div>
            ) : report.snapshot_image ? (
              <div className="space-y-4">
                <div className="relative aspect-video rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  <img
                    src={report.snapshot_image}
                    alt="Integrity Breach frame snapshot"
                    className="w-full h-full object-cover"
                  />
                  <Badge variant="error" className="absolute top-2 left-2 !text-[8px] font-bold rounded">
                    Violation Snapshot Frame
                  </Badge>
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">Snapshot context</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                    {report.snapshot_description || 'Compliance snapshot logged by system monitoring.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                <UserCheck size={32} className="mx-auto text-emerald-500" />
                <h4 className="text-xs font-bold text-slate-800 dark:text-white">Clean Compliance Record</h4>
                <p className="text-xs text-slate-500 dark:text-slate-500 max-w-[260px] mx-auto leading-normal">
                  No visual integrity flags or snap captures were logged by the system proctoring engine.
                </p>
              </div>
            )}
          </Card>

          {/* Full-session recording — admin only (§2.2), now its own card inline next to
              the snapshot instead of stacked below it. Click to fetch a short-lived signed
              URL from the PRIVATE interview-recordings bucket, then play inline. */}
          {showVideoCard && (
            <Card className="space-y-3 no-print print:hidden">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800/80 pb-3">
                Session Recording
              </h3>
              {videoUrl && !videoPlaybackError ? (
                <video
                  controls
                  src={videoUrl}
                  className="w-full rounded-xl bg-black max-h-[420px]"
                  // Playback failed inside the element (expired signed URL, codec, network
                  // drop). Surface it with a retry instead of leaving a silently-frozen player.
                  onError={() => setVideoPlaybackError('The recording could not be played — the secure link may have expired. Retry to generate a fresh one.')}
                />
              ) : (
                <div className="p-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    A full-session camera recording is stored for this interview.
                  </p>
                  {(videoError || videoPlaybackError) && (
                    <Alert variant="error" className="text-xs">{videoError || videoPlaybackError}</Alert>
                  )}
                  <Button
                    size="sm"
                    loading={videoLoading}
                    onClick={() => { setVideoUrl(''); setVideoPlaybackError(''); loadSessionVideo(); }}
                  >
                    {videoLoading
                      ? 'Preparing secure link...'
                      : (videoPlaybackError ? 'Retry Playback' : 'Play Session Recording')}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Audit Logs */}
          <Card className={`space-y-4 print:shadow-none print:border-slate-300 ${showVideoCard ? '' : 'lg:col-span-1'}`}>
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800/80 pb-3 print:border-slate-300">
              Integrity Audit Trail
            </h3>
            {proctorLogsList.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 pr-1 max-h-[400px] overflow-y-auto">
                {proctorLogsList.map((log, idx) => (
                  <div
                    key={idx}
                    className={`py-3 flex flex-col gap-1 text-xs ${user?.role === 'admin' ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40 rounded-lg px-2 -mx-2 transition no-print' : ''}`}
                    onClick={user?.role === 'admin' ? () => openSnapshotModal(log) : undefined}
                    title={user?.role === 'admin' ? 'View archived snapshots for this session' : undefined}
                  >
                    <div className="flex items-center gap-1.5 justify-between">
                      <Badge variant={getLogBadgeVariant(log.type)} className="!text-[8px] font-extrabold uppercase py-0 px-1 rounded">
                        {log.type.replace('_', ' ')}
                      </Badge>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 font-semibold leading-relaxed font-sans">{log.details}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 dark:text-slate-600 text-xs italic font-sans">
                Zero violation trails logged.
              </div>
            )}
            {technicalNotesList.length > 0 && (
              <div className="pt-3 mt-1 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                <h4 className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Technical Notes
                </h4>
                {technicalNotesList.map((log, idx) => (
                  <div key={idx} className="text-xs flex items-start gap-2 text-slate-500 dark:text-slate-400 font-sans">
                    <span className="text-[9px] font-mono text-slate-400 dark:text-slate-600 shrink-0 pt-0.5">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span>{log.details}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Integrity Snapshot Gallery modal — every archived webcam/screen capture for THIS
          candidate's session, browsable via a slider. Opened from an Integrity Audit Trail
          entry (admin only). */}
      {snapshotModalOpen && createPortal(
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSnapshotModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl glass-panel rounded-2xl border border-primary-500/30 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert size={16} className="text-primary-400" />
                Integrity Snapshot Gallery
              </h3>
              <button
                onClick={() => setSnapshotModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {auditSnapshots.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400 italic">
                  No archived snapshots are on file for this candidate's session.
                </div>
              ) : (
                <>
                  <div className="relative aspect-video rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
                    {snapshotUrlLoading ? (
                      <Spinner label="Loading snapshot..." />
                    ) : snapshotUrlError ? (
                      <p className="text-xs text-red-500 px-4 text-center">{snapshotUrlError}</p>
                    ) : (
                      <img
                        src={snapshotUrlCache[auditSnapshots[snapshotIndex]?.id]}
                        alt="Archived proctoring snapshot"
                        className="w-full h-full object-contain"
                      />
                    )}
                    <Badge
                      variant={auditSnapshots[snapshotIndex]?.kind === 'webcam' ? 'error' : auditSnapshots[snapshotIndex]?.kind === 'identity' ? 'primary' : 'info'}
                      className="absolute top-2 left-2 !text-[8px] font-bold rounded"
                    >
                      {auditSnapshots[snapshotIndex]?.kind === 'webcam' ? 'Webcam Frame'
                        : auditSnapshots[snapshotIndex]?.kind === 'identity' ? 'Identity Check'
                        : 'Screen Capture'}
                    </Badge>
                    {auditSnapshots.length > 1 && (
                      <>
                        <button
                          onClick={() => setSnapshotIndex((i) => (i - 1 + auditSnapshots.length) % auditSnapshots.length)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/60 text-white hover:bg-slate-900/80 transition"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          onClick={() => setSnapshotIndex((i) => (i + 1) % auditSnapshots.length)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/60 text-white hover:bg-slate-900/80 transition"
                        >
                          <ChevronRight size={16} />
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
                      className="w-full accent-primary-600 cursor-pointer"
                    />
                  )}

                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                    <span>
                      {auditSnapshots[snapshotIndex]?.captured_at
                        ? new Date(auditSnapshots[snapshotIndex].captured_at).toLocaleString()
                        : ''}
                    </span>
                    <span>{snapshotIndex + 1} / {auditSnapshots.length}</span>
                  </div>

                  {auditSnapshots[snapshotIndex]?.label && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-sans">
                      {auditSnapshots[snapshotIndex].label}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* TAB 4: USER REMARKS */}
      <div className={`space-y-6 ${activeTab === 'feedback' ? 'block' : 'hidden print:block'}`}>
        <Card className="space-y-6 print:shadow-none print:border-slate-300">
          <CardTitle className="border-b border-slate-200 dark:border-slate-800 pb-3">
            Submit Assessment Feedback
          </CardTitle>

          {feedbackSubmitted ? (
            <Alert variant="success" className="font-bold text-xs">
              Thank you! Your feedback has been registered and sent to our assessment support team.
            </Alert>
          ) : (
            <form onSubmit={handleSubmitFeedback} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Rate this assessment session
                  </label>
                  <select
                    className="w-full glass-input text-sm cursor-pointer"
                    value={rating}
                    onChange={(e) => setRating(parseInt(e.target.value))}
                  >
                    <option value="5">★★★★★ (5 - Excellent)</option>
                    <option value="4">★★★★☆ (4 - Good)</option>
                    <option value="3">★★★☆☆ (3 - Average)</option>
                    <option value="2">★★☆☆☆ (2 - Poor)</option>
                    <option value="1">★☆☆☆☆ (1 - Very Bad)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Report any hardware / AI issues
                  </label>
                  <input
                    type="text"
                    className="w-full glass-input text-sm"
                    placeholder="e.g. Minor lag in speech transcript."
                    value={issuesReported}
                    onChange={(e) => setIssuesReported(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-sans">Review Remarks</label>
                <textarea
                  className="w-full glass-input text-sm min-h-20"
                  placeholder="Share your thoughts about this mock assessment experience..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" loading={feedbackLoading} size="sm">
                  {feedbackLoading ? 'Submitting Remarks...' : 'Submit Feedback'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>

      {/* Admin Tools — cross-links to the LLM scoring breakdown and the proctoring
          snapshot gallery for this specific session, so an admin reviewing a report
          never has to leave it and manually re-search elsewhere. (The candidate Profile
          hub link is backlogged, not deleted — /admin/users/:userId still works.) */}
      {user?.role === 'admin' && (
        <div className={`space-y-4 no-print ${activeTab === 'admin' ? 'block' : 'hidden'}`}>
          <Card className="space-y-3">
            <CardTitle className="border-b border-slate-200 dark:border-slate-800 pb-3">
              Admin Tools
            </CardTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                to={`/admin/scoring?interview_id=${interview.id}`}
                className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-primary-400 dark:hover:border-primary-600 transition flex flex-col gap-1"
              >
                <span className="text-xs font-bold text-slate-900 dark:text-slate-200">LLM Scoring Breakdown</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Per-question score, confidence, and rationale for this session.</span>
              </Link>
              <Link
                to={`/admin/logs?tab=snapshots&interview_id=${interview.id}`}
                className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-primary-400 dark:hover:border-primary-600 transition flex flex-col gap-1"
              >
                <span className="text-xs font-bold text-slate-900 dark:text-slate-200">Proctoring Snapshots</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Every archived webcam/screen image captured during this session.</span>
              </Link>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
};

export default ReportDetailPage;
