import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';
import api from '../services/api';
import Alert from '../components/ui/Alert';
import Pagination from '../components/ui/Pagination';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shadcn/table';
import { StaggerRow, StaggerItem } from '@/components/shadcn/motion';
import { StatCard, StatGrid } from '@/components/shadcn/stat-card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  scoreColor,
} from '@/components/shadcn/chart';
import {
  AdminPageHeader,
  AdminSearch,
  AdminEmpty,
  AdminPageSkeleton,
  AdminTableCard,
} from '@/components/shadcn/page';
import { AdminFilter, facetOptions, applyFacets } from '@/components/shadcn/filter';
import {
  Gauge,
  Target,
  Activity,
  AlertTriangle,
  ClipboardList,
  ChevronLeft,
  ArrowRight,
  MessageSquareText,
  FlaskConical,
  FileText,
} from 'lucide-react';

const PAGE_SIZE = 10;

/** Band start drives the colour, so the distribution chart and every score figure on the
 *  page agree — a 60-79 bar cannot be a different colour from a 65% score elsewhere. */
const bandColor = (range) => scoreColor(parseInt(String(range).split('-')[0], 10));

const AdminScoringPage = () => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);

  // The drill-in is driven by ?interview_id= rather than local state so a specific
  // breakdown is linkable and bookmarkable — it is what the report page's
  // "LLM Scoring Breakdown" link points at.
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
      return undefined;
    }
    let cancelled = false;
    setDetailLoading(true);
    setError('');
    api
      .get(`/admin/scoring/interviews/${interviewIdParam}`)
      .then((res) => {
        if (!cancelled) setDetail(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError('Failed to load the per-question scoring breakdown.');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [interviewIdParam]);

  const openDetail = (interviewId) => setSearchParams({ interview_id: interviewId });
  const closeDetail = () => setSearchParams({}, { replace: true });

  const overview = analytics?.overview || {};
  const allInterviews = useMemo(() => analytics?.interviews || [], [analytics]);

  const FACETS = {
    job_role: (r) => r.job_role,
    type: (r) => r.type,
    flagged: (r) => (r.flagged_count > 0 ? 'yes' : 'no'),
  };

  const filterGroups = useMemo(
    () => [
      { key: 'job_role', label: 'Job role', options: facetOptions(allInterviews, FACETS.job_role) },
      { key: 'type', label: 'Interview type', options: facetOptions(allInterviews, FACETS.type) },
      {
        key: 'flagged',
        label: 'Manual review',
        options: facetOptions(allInterviews, FACETS.flagged, {
          order: ['yes', 'no'],
          labels: { yes: 'Has flagged answers', no: 'None flagged' },
        }),
      },
    ],
    [allInterviews]
  );

  const interviews = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const bySearch = !q
      ? allInterviews
      : allInterviews.filter((r) =>
          [r.candidate_name, r.job_role, r.type].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
        );
    return applyFacets(bySearch, filters, FACETS);
  }, [allInterviews, searchTerm, filters]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filters]);

  const pagedInterviews = interviews.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <AdminPageSkeleton rows={6} cols={6} />;

  /* ------------------------------------------- drill-in: one interview's questions */
  if (detail) {
    const itv = detail.interview;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={closeDetail} className="-ml-2">
            <ChevronLeft /> Back to Scoring Analytics
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/interview/report/${interviewIdParam}`}>
              <FileText /> View Full Report
            </Link>
          </Button>
        </div>

        <AdminPageHeader
          icon={ClipboardList}
          title={`${itv.candidate_name} — ${itv.job_role}`}
          subtitle={`${itv.type} interview · ${itv.difficulty}`}
          actions={
            <Badge variant="outline" size="lg">
              Overall{' '}
              <span className="font-mono font-bold" style={{ color: scoreColor(itv.overall_score) }}>
                {itv.overall_score ?? '—'}%
              </span>
            </Badge>
          }
        />

        {error && <Alert variant="error">{error}</Alert>}

        <div className="space-y-4">
          {detail.questions.map((q, idx) => (
            <StaggerItem key={idx} index={idx}>
              <article
                className={cn(
                  'rounded-xl border bg-card p-4',
                  q.flagged ? 'border-amber-500/40' : 'border-border'
                )}
              >
                <header className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <Badge variant="secondary" size="sm" className="shrink-0">
                      Q{idx + 1}
                    </Badge>
                    <p className="text-sm font-semibold text-foreground">{q.question}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-xl font-bold" style={{ color: scoreColor(q.score ?? 0) }}>
                      {q.score ?? '—'}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">confidence {q.confidence ?? '—'}%</div>
                  </div>
                </header>

                {q.flagged && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-3.5" />
                    Flagged for manual review — the evaluator had low confidence in this score.
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Pane icon={MessageSquareText} title="Candidate transcript" body={q.transcript} empty="No response recorded." />
                  <Pane icon={FlaskConical} title="LLM rationale" body={q.rationale} empty="No rationale recorded." />
                </div>
              </article>
            </StaggerItem>
          ))}
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------- overview + interview list */
  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Gauge}
        title="LLM Scoring Analytics"
        subtitle="How the AI evaluator is scoring interviews, from live per-question evaluations."
      >
        <AdminSearch
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by candidate, role or type…"
        >
          <AdminFilter groups={filterGroups} value={filters} onChange={setFilters} />
        </AdminSearch>
      </AdminPageHeader>

      {error && <Alert variant="error">{error}</Alert>}
      {detailLoading && <Alert variant="info">Loading breakdown…</Alert>}

      <StatGrid>
        <StatCard
          index={0}
          label="Evaluations"
          value={overview.total_evaluations ?? 0}
          icon={Activity}
          tone="primary"
          hint={`${overview.total_interviews ?? 0} completed interviews`}
        />
        <StatCard
          index={1}
          label="Average Score"
          formatted={
            <span style={{ color: scoreColor(overview.avg_score) }}>{overview.avg_score ?? 0}%</span>
          }
          icon={Target}
          tone="success"
        />
        <StatCard index={2} label="Average Confidence" value={overview.avg_confidence ?? 0} suffix="%" icon={Gauge} tone="accent" />
        <StatCard
          index={3}
          label="Flagged for Review"
          value={overview.flagged_evaluations ?? 0}
          icon={AlertTriangle}
          tone={overview.flagged_evaluations > 0 ? 'warning' : 'neutral'}
          hint="low-confidence evaluations"
        />
      </StatGrid>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-bold text-foreground">Score Distribution</h3>
        {overview.total_evaluations > 0 ? (
          <ChartContainer className="aspect-auto h-64 w-full" config={{ count: { label: 'Evaluations' } }}>
            <BarChart data={overview.score_distribution} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="range" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
              <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {overview.score_distribution.map((d) => (
                  <Cell key={d.range} fill={bandColor(d.range)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        ) : (
          <AdminEmpty icon={Gauge} title="Nothing scored yet" message="No completed interviews with scored answers." />
        )}
      </div>

      <AdminTableCard>
        <h3 className="border-b border-border px-4 py-3 text-sm font-bold text-foreground">Interview Reports</h3>
        {interviews.length === 0 ? (
          <AdminEmpty icon={ClipboardList} title="No interviews to analyse" message="Completed sessions will appear here." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead className="hidden sm:table-cell">Role / Type</TableHead>
                  <TableHead className="text-center">Questions</TableHead>
                  <TableHead className="text-center">Avg Score</TableHead>
                  <TableHead className="hidden text-center md:table-cell">Confidence</TableHead>
                  <TableHead className="text-center">Flagged</TableHead>
                  <TableHead className="text-right">Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedInterviews.map((row, i) => (
                  <StaggerRow
                    key={row.interview_id}
                    index={i}
                    onClick={() => openDetail(row.interview_id)}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-accent/60"
                  >
                    <TableCell className="font-semibold text-foreground">{row.candidate_name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="font-semibold capitalize text-foreground">{row.job_role}</div>
                      <div className="text-[11px] capitalize text-muted-foreground">{row.type}</div>
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">{row.question_count}</TableCell>
                    <TableCell className="text-center font-mono font-bold" style={{ color: scoreColor(row.avg_score) }}>
                      {row.avg_score}%
                    </TableCell>
                    <TableCell className="hidden text-center font-mono text-muted-foreground md:table-cell">
                      {row.avg_confidence}%
                    </TableCell>
                    <TableCell className="text-center">
                      {row.flagged_count > 0 ? (
                        <Badge variant="warning" size="sm">
                          {row.flagged_count}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground">
                        <ArrowRight className="size-4" />
                      </span>
                    </TableCell>
                  </StaggerRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t border-border px-3">
              <Pagination page={page} total={interviews.length} onChange={setPage} />
            </div>
          </>
        )}
      </AdminTableCard>
    </div>
  );
};

const Pane = ({ icon: Icon, title, body, empty }) => (
  <div className="rounded-xl border border-border bg-muted/40 p-3">
    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      <Icon className="size-3" /> {title}
    </p>
    <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
      {body || <span className="italic opacity-70">{empty}</span>}
    </p>
  </div>
);

export default AdminScoringPage;
