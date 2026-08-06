import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import Pagination from '../components/ui/Pagination';

const PAGE_SIZE = 10;
import {
  Gauge, Target, Activity, AlertTriangle, ClipboardList, ChevronLeft,
  ArrowRight, MessageSquareText, FlaskConical, FileText,
} from 'lucide-react';

const scoreColor = (score) => {
  if (score >= 80) return 'text-emerald-500 dark:text-emerald-400';
  if (score >= 60) return 'text-primary-500 dark:text-primary-400';
  if (score >= 40) return 'text-amber-500 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
};

const barColor = (range) => {
  const start = parseInt(range.split('-')[0], 10);
  if (start >= 80) return '#10b981';
  if (start >= 60) return '#6366f1';
  if (start >= 40) return '#f59e0b';
  return '#ef4444';
};

const AdminScoringPage = () => {
  const { isDark } = useTheme();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);

  // The drill-in is driven by ?interview_id= in the URL rather than local-only state, so a
  // specific interview's scoring breakdown is linkable/bookmarkable/shareable (and is what
  // ReportDetailPage's "LLM Scoring Breakdown" admin link points at).
  const [searchParams, setSearchParams] = useSearchParams();
  const interviewIdParam = searchParams.get('interview_id');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get('/admin/scoring/analytics');
        setAnalytics(res.data);
      } catch (err) {
        console.error(err);
        setError('Failed to load scoring analytics.');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (!interviewIdParam) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setError('');
    api.get(`/admin/scoring/interviews/${interviewIdParam}`)
      .then((res) => { if (!cancelled) setDetail(res.data); })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError('Failed to load the per-question scoring breakdown.');
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [interviewIdParam]);

  const openDetail = (interviewId) => setSearchParams({ interview_id: interviewId });
  const closeDetail = () => setSearchParams({}, { replace: true });

  const axisTick = { fill: isDark ? '#94a3b8' : '#64748b', fontSize: 12 };

  if (loading) {
    return (
      <Card className="text-center max-w-md mx-auto my-12">
        <Spinner label="Loading scoring analytics..." />
      </Card>
    );
  }

  // ---- Drill-in: per-question breakdown for one interview -----------------------
  if (detail) {
    const itv = detail.interview;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={closeDetail}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
          >
            <ChevronLeft size={16} /> Back to Scoring Analytics
          </button>
          <Link
            to={`/interview/report/${interviewIdParam}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline"
          >
            <FileText size={15} /> View Full Report
          </Link>
        </div>

        <PageHeader
          icon={ClipboardList}
          title={`${itv.candidate_name} — ${itv.job_role}`}
          subtitle={`${itv.type} interview · ${itv.difficulty} · Overall ${itv.overall_score ?? '—'}%`}
        />

        {error && <Alert variant="error">{error}</Alert>}

        <div className="space-y-4">
          {detail.questions.map((q, idx) => (
            <Card key={idx} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Badge variant="primary" size="sm" className="!normal-case shrink-0">Q{idx + 1}</Badge>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{q.question}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-xl font-bold font-mono ${scoreColor(q.score ?? 0)}`}>
                    {q.score ?? '—'}%
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    confidence {q.confidence ?? '—'}%
                  </div>
                </div>
              </div>

              {q.flagged && (
                <Alert variant="warning">
                  <span className="flex items-center gap-2">
                    <AlertTriangle size={14} /> Flagged for manual review (low evaluation confidence).
                  </span>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 flex items-center gap-1.5">
                    <MessageSquareText size={12} /> Candidate transcript
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {q.transcript || <span className="italic text-slate-400">No response recorded.</span>}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 flex items-center gap-1.5">
                    <FlaskConical size={12} /> LLM rationale
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {q.rationale || <span className="italic text-slate-400">No rationale recorded.</span>}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ---- Overview + interview list ------------------------------------------------
  const overview = analytics?.overview || {};
  const interviews = analytics?.interviews || [];
  const pagedInterviews = interviews.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Gauge}
        title="LLM Scoring Analytics"
        subtitle="How the AI evaluator is scoring candidate interviews, sourced from live per-question evaluations."
      />

      {error && <Alert variant="error">{error}</Alert>}

      {detailLoading && (
        <Alert variant="info">Loading breakdown…</Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Evaluations" value={overview.total_evaluations ?? 0} icon={Activity} color="primary"
          subtext={`${overview.total_interviews ?? 0} completed interviews`} />
        <StatCard title="Avg Score" value={`${overview.avg_score ?? 0}%`} icon={Target} color="success" />
        <StatCard title="Avg Confidence" value={`${overview.avg_confidence ?? 0}%`} icon={Gauge} color="violet" />
        <StatCard title="Flagged for Review" value={overview.flagged_evaluations ?? 0} icon={AlertTriangle} color="warning"
          subtext="Low-confidence evaluations" />
      </div>

      <Card className="space-y-4">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Score Distribution</h3>
        {overview.total_evaluations > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.score_distribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="range" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(100,116,139,0.08)' }}
                  contentStyle={{
                    background: isDark ? '#0f172a' : '#ffffff',
                    border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
                    borderRadius: 12, fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Evaluations">
                  {overview.score_distribution.map((d) => (
                    <Cell key={d.range} fill={barColor(d.range)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
            No completed interviews with scored answers yet.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">Interview Reports</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 font-bold">Candidate</th>
                <th className="py-3 font-bold">Role / Type</th>
                <th className="py-3 font-bold text-center">Questions</th>
                <th className="py-3 font-bold text-center">Avg Score</th>
                <th className="py-3 font-bold text-center">Avg Confidence</th>
                <th className="py-3 font-bold text-center">Flagged</th>
                <th className="py-3 font-bold text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {interviews.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 dark:text-slate-400">
                    No completed interviews to analyse yet.
                  </td>
                </tr>
              ) : (
                pagedInterviews.map((row) => (
                  <tr
                    key={row.interview_id}
                    onClick={() => openDetail(row.interview_id)}
                    className="text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors cursor-pointer"
                  >
                    <td className="py-4 font-bold text-slate-900 dark:text-slate-200">{row.candidate_name}</td>
                    <td className="py-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-300 capitalize">{row.job_role}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">{row.type}</div>
                    </td>
                    <td className="py-4 text-center">{row.question_count}</td>
                    <td className={`py-4 text-center font-mono font-bold ${scoreColor(row.avg_score)}`}>{row.avg_score}%</td>
                    <td className="py-4 text-center font-mono">{row.avg_confidence}%</td>
                    <td className="py-4 text-center">
                      {row.flagged_count > 0 ? (
                        <Badge variant="warning" size="sm">{row.flagged_count}</Badge>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-4 text-right">
                      <span className="p-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 rounded-lg inline-flex items-center">
                        <ArrowRight size={14} />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={interviews.length} onChange={setPage} />
      </Card>
    </div>
  );
};

export default AdminScoringPage;
