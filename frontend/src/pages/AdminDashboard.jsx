import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import api from '../services/api';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/shadcn/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/shadcn/card';
import { Badge, StatusBadge } from '@/components/shadcn/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shadcn/table';
import { Separator, Skeleton, Tooltip as Hint } from '@/components/shadcn/misc';
import { StatCard, StatGrid } from '@/components/shadcn/stat-card';
import { Reveal, StaggerRow, AuroraBackdrop, GradientBorderCard } from '@/components/shadcn/motion';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  scoreColor,
} from '@/components/shadcn/chart';
import Alert from '../components/ui/Alert';
import Pagination from '../components/ui/Pagination';
import {
  Users,
  Video,
  Coins,
  MessageSquare,
  Activity,
  ShieldAlert,
  CheckCircle,
  Unlock,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Star,
} from 'lucide-react';

const PAGE_SIZE = 10;
const TREND_DAYS = 14;

/** Local YYYY-MM-DD key. Deliberately not toISOString(), which converts to UTC and would
 *  file an evening interview under the following day for admins in PKT (UTC+5). */
const dayKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(1);

  const loadDashboardData = useCallback(async () => {
    try {
      setError('');
      // Fetched together rather than in sequence: three round trips to Mumbai run back to
      // back is a visibly slower dashboard than three in flight at once.
      const [statsRes, usersRes, interviewsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/interviews'),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data || []);
      setInterviews(interviewsRes.data || []);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch platform metrics and statistics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleQuickUnban = async (userId) => {
    setActionLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/admin/users/${userId}/ban`);
      setSuccess('Student account status reopened successfully!');
      await loadDashboardData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update student access.');
    } finally {
      setActionLoading(false);
    }
  };

  /* ----------------------------------------------------------------- derived data */

  // The /admin/stats endpoint returns counts only, so the trends below are derived from
  // the interview list the page already loads — no extra endpoint, and the numbers cannot
  // disagree with the table underneath them.
  const trend = useMemo(() => {
    const buckets = new Map();
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      buckets.set(dayKey(d), {
        date: dayKey(d),
        label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        completed: 0,
        terminated: 0,
      });
    }
    interviews.forEach((iv) => {
      if (!iv.created_at) return;
      const bucket = buckets.get(dayKey(iv.created_at));
      if (!bucket) return; // older than the window
      if (iv.is_proctor_failed) bucket.terminated += 1;
      else if (iv.status === 'completed') bucket.completed += 1;
    });
    return Array.from(buckets.values());
  }, [interviews]);

  const scoreBands = useMemo(() => {
    const bands = [
      { band: '0–39', min: 0, max: 39, count: 0, color: scoreColor(10) },
      { band: '40–59', min: 40, max: 59, count: 0, color: scoreColor(45) },
      { band: '60–79', min: 60, max: 79, count: 0, color: scoreColor(65) },
      { band: '80–100', min: 80, max: 100, count: 0, color: scoreColor(90) },
    ];
    interviews.forEach((iv) => {
      if (iv.overall_score === null || iv.overall_score === undefined) return;
      const b = bands.find((x) => iv.overall_score >= x.min && iv.overall_score <= x.max);
      if (b) b.count += 1;
    });
    return bands;
  }, [interviews]);

  const outcomes = useMemo(() => {
    let completed = 0;
    let terminated = 0;
    let active = 0;
    interviews.forEach((iv) => {
      if (iv.is_proctor_failed) terminated += 1;
      else if (iv.status === 'completed') completed += 1;
      else active += 1;
    });
    return [
      { name: 'Completed', value: completed, fill: 'var(--color-chart-2)' },
      { name: 'Terminated', value: terminated, fill: '#dc2626' },
      { name: 'In progress', value: active, fill: 'var(--color-chart-3)' },
    ].filter((d) => d.value > 0);
  }, [interviews]);

  const avgScore = useMemo(() => {
    const scored = interviews.filter((i) => typeof i.overall_score === 'number');
    if (!scored.length) return null;
    return scored.reduce((sum, i) => sum + i.overall_score, 0) / scored.length;
  }, [interviews]);

  const last7 = trend.slice(-7).reduce((s, d) => s + d.completed, 0);
  const prev7 = trend.slice(0, 7).reduce((s, d) => s + d.completed, 0);
  const weekDelta = last7 - prev7;

  const flaggedUsers = users.filter((u) => u.status === 'banned');
  const pagedFlagged = flaggedUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const onlineCount = users.filter((u) => u.online).length;

  /* ------------------------------------------------------------------- rendering */

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <StatGrid>
          {[0, 1, 2, 3].map((i) => (
            <StatCard key={i} loading />
          ))}
        </StatGrid>
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------------ hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 lg:p-8">
        <AuroraBackdrop />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge variant="success" pulse>
                System Online
              </StatusBadge>
              {onlineCount > 0 && (
                <Badge variant="info">
                  {onlineCount} candidate{onlineCount === 1 ? '' : 's'} online
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground lg:text-3xl">
              Admin Control Center
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live intake metrics, integrity monitoring and candidate throughput.
            </p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="shrink-0 self-start">
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* ----------------------------------------------------------------- tiles */}
      {stats && (
        <StatGrid>
          <RouterLink to="/admin/users" className="block focus-visible:outline-none">
            <StatCard
              index={0}
              label="Registered Candidates"
              value={stats.users.total}
              icon={Users}
              tone="primary"
              hint={`${stats.users.active} active · ${stats.users.banned} flagged`}
            />
          </RouterLink>
          <RouterLink to="/admin/interviews" className="block focus-visible:outline-none">
            <StatCard
              index={1}
              label="Interviews Completed"
              value={stats.interviews.completed}
              icon={Video}
              tone="success"
              delta={weekDelta}
              deltaGood="up"
              hint={`${stats.interviews.daily} in last 24h`}
            />
          </RouterLink>
          <RouterLink to="/admin/scoring" className="block focus-visible:outline-none">
            <StatCard
              index={2}
              label="Average Score"
              formatted={
                avgScore === null ? '—' : <span style={{ color: scoreColor(avgScore) }}>{avgScore.toFixed(1)}%</span>
              }
              icon={TrendingUp}
              tone="accent"
              hint={`${interviews.filter((i) => typeof i.overall_score === 'number').length} scored`}
            />
          </RouterLink>
          <RouterLink to="/admin/transactions" className="block focus-visible:outline-none">
            <StatCard
              index={3}
              label="Tokens Consumed"
              value={stats.tokens.total_consumed}
              icon={Coins}
              tone="warning"
              hint={`${stats.tokens.total_available} available in pool`}
            />
          </RouterLink>
        </StatGrid>
      )}

      {/* ---------------------------------------------------------------- charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Reveal className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Interview Activity</CardTitle>
              <CardDescription>Completed vs auto-terminated, last {TREND_DAYS} days</CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" asChild>
                  <RouterLink to="/admin/interviews">
                    All interviews <ArrowRight />
                  </RouterLink>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {interviews.length === 0 ? (
                <EmptyChart message="No interviews recorded yet." />
              ) : (
                <ChartContainer
                  className="aspect-auto h-64 w-full"
                  config={{
                    completed: { label: 'Completed', color: 'var(--color-chart-2)' },
                    terminated: { label: 'Terminated', color: '#dc2626' },
                  }}
                >
                  <AreaChart data={trend} margin={{ left: -18, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-completed)" stopOpacity={0.7} />
                        <stop offset="95%" stopColor="var(--color-completed)" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="fillTerminated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-terminated)" stopOpacity={0.6} />
                        <stop offset="95%" stopColor="var(--color-terminated)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Area
                      dataKey="completed"
                      type="monotone"
                      stroke="var(--color-completed)"
                      strokeWidth={2}
                      fill="url(#fillCompleted)"
                      stackId="a"
                    />
                    <Area
                      dataKey="terminated"
                      type="monotone"
                      stroke="var(--color-terminated)"
                      strokeWidth={2}
                      fill="url(#fillTerminated)"
                      stackId="a"
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </Reveal>

        <Reveal delay={0.08}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Outcomes</CardTitle>
              <CardDescription>All recorded sessions</CardDescription>
            </CardHeader>
            <CardContent>
              {outcomes.length === 0 ? (
                <EmptyChart message="Nothing to summarise yet." />
              ) : (
                <>
                  <ChartContainer
                    className="aspect-auto h-44 w-full"
                    config={{
                      Completed: { label: 'Completed', color: 'var(--color-chart-2)' },
                      Terminated: { label: 'Terminated', color: '#dc2626' },
                      'In progress': { label: 'In progress', color: 'var(--color-chart-3)' },
                    }}
                  >
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Pie data={outcomes} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2} strokeWidth={0}>
                        {outcomes.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="mt-2 space-y-1.5">
                    {outcomes.map((o) => (
                      <div key={o.name} className="flex items-center gap-2 text-xs">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: o.fill }} />
                        <span className="text-muted-foreground">{o.name}</span>
                        <span className="ml-auto font-mono font-bold text-foreground">{o.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </Reveal>
      </div>

      {/* -------------------------------------------------------- score bands */}
      <Reveal>
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
            <CardDescription>How candidate results cluster across bands</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <RouterLink to="/admin/scoring">
                  Scoring analytics <ArrowRight />
                </RouterLink>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {scoreBands.every((b) => b.count === 0) ? (
              <EmptyChart message="No scored interviews yet." />
            ) : (
              <ChartContainer className="aspect-auto h-56 w-full" config={{ count: { label: 'Candidates' } }}>
                <BarChart data={scoreBands} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="band" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                  <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {scoreBands.map((b) => (
                      <Cell key={b.band} fill={b.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </Reveal>

      {/* ------------------------------------------------------ integrity alerts */}
      <Reveal>
        {flaggedUsers.length > 0 ? (
          <GradientBorderCard>
            <FlaggedPanel
              flaggedUsers={flaggedUsers}
              pagedFlagged={pagedFlagged}
              page={page}
              setPage={setPage}
              actionLoading={actionLoading}
              onUnban={handleQuickUnban}
            />
          </GradientBorderCard>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <CheckCircle className="mx-auto mb-3 size-8 text-emerald-500/50" />
              <p className="text-sm font-semibold text-foreground">All candidate profiles are clear</p>
              <p className="text-xs text-muted-foreground">No active locks or integrity bans.</p>
            </CardContent>
          </Card>
        )}
      </Reveal>

      {/* -------------------------------------------------- feedback + audit log */}
      {stats && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-primary" /> Recent Feedback
                </CardTitle>
                <CardAction>
                  <Button variant="ghost" size="sm" asChild>
                    <RouterLink to="/admin/feedback">
                      View all <ArrowRight />
                    </RouterLink>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="max-h-96 space-y-4 overflow-y-auto">
                {stats.feedbacks.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">No feedback submissions yet.</p>
                ) : (
                  stats.feedbacks.map((f, idx) => (
                    <div key={f.id}>
                      {idx > 0 && <Separator className="mb-4" />}
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-foreground">{f.user_name}</span>
                        <span className="flex shrink-0 items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={cn('size-3', i < f.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')}
                            />
                          ))}
                        </span>
                      </div>
                      {f.issues_reported && (
                        <div className="mt-1.5 rounded border border-destructive/15 bg-destructive/5 px-2 py-1 text-[11px] text-destructive">
                          Issue: {f.issues_reported}
                        </div>
                      )}
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.feedback_text}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </Reveal>

          <Reveal delay={0.08}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="size-4 text-primary" /> System Audit Trail
                </CardTitle>
                <CardAction>
                  <Button variant="ghost" size="sm" asChild>
                    <RouterLink to="/admin/logs">
                      View all <ArrowRight />
                    </RouterLink>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="max-h-96 space-y-3 overflow-y-auto">
                {stats.logs.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">No administrative actions logged.</p>
                ) : (
                  stats.logs.map((log, idx) => (
                    <div key={log.id}>
                      {idx > 0 && <Separator className="mb-3" />}
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <Badge variant="outline" size="sm" className="font-mono">
                          {log.action}
                        </Badge>
                        <Hint content={new Date(log.created_at).toLocaleString()}>
                          <span className="shrink-0 text-muted-foreground">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </span>
                        </Hint>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{log.details}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </Reveal>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------- helpers */

const EmptyChart = ({ message }) => (
  <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
    <Activity className="size-7 text-muted-foreground/30" />
    <p className="text-xs text-muted-foreground">{message}</p>
  </div>
);

const FlaggedPanel = ({ flaggedUsers, pagedFlagged, page, setPage, actionLoading, onUnban }) => (
  <div className="p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-5 shrink-0 text-destructive" />
        <div>
          <h3 className="font-bold text-foreground">Integrity Alerts</h3>
          <p className="text-xs text-muted-foreground">
            {flaggedUsers.length} account{flaggedUsers.length === 1 ? '' : 's'} locked by the proctor
          </p>
        </div>
      </div>
      <Button variant="ghost" size="sm" asChild className="shrink-0">
        <RouterLink to="/admin/users">
          Manage users <ArrowRight />
        </RouterLink>
      </Button>
    </div>

    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Candidate</TableHead>
          <TableHead className="hidden sm:table-cell">Job Focus</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pagedFlagged.map((student, i) => (
          <StaggerRow key={student.id} index={i} className="border-b border-border transition-colors hover:bg-accent/60">
            <TableCell>
              <RouterLink to={`/admin/users/${student.id}`} className="block hover:underline">
                <span className="block font-semibold text-foreground">{student.name}</span>
                <span className="text-[11px] text-muted-foreground">{student.email}</span>
              </RouterLink>
            </TableCell>
            <TableCell className="hidden capitalize text-muted-foreground sm:table-cell">{student.job_role}</TableCell>
            <TableCell>
              <Badge variant="destructive">
                <ShieldAlert /> Proctor lock
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button variant="outline" size="sm" onClick={() => onUnban(student.id)} disabled={actionLoading}>
                <Unlock /> Reopen
              </Button>
            </TableCell>
          </StaggerRow>
        ))}
      </TableBody>
    </Table>
    <Pagination page={page} total={flaggedUsers.length} onChange={setPage} />
  </div>
);

export default AdminDashboard;
