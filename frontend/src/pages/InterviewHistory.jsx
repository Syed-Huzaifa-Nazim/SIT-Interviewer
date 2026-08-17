import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Alert from '../components/ui/Alert';
import Pagination from '../components/ui/Pagination';
import { timeAgo, formatDateTime } from '../utils/datetime';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { NativeSelect } from '@/components/shadcn/input';
import { StatCard, StatGrid } from '@/components/shadcn/stat-card';
import { StaggerItem } from '@/components/shadcn/motion';
import {
  AdminPageHeader,
  AdminSearch,
  AdminEmpty,
  AdminPageSkeleton,
} from '@/components/shadcn/page';
import { History, ArrowUpRight, Award, TrendingUp, CheckCircle2, PlayCircle } from 'lucide-react';

const PAGE_SIZE = 10;

/**
 * Mock assessment history.
 *
 * Rebuilt on the same shared page furniture the Admin Hub uses (AdminPageHeader /
 * AdminSearch / StatGrid / AdminEmpty) rather than the older one-off candidate widgets, so
 * this page stops being the odd one out. The data and the filtering behaviour are unchanged.
 */

const scoreTone = (score) => {
  if (score == null) return 'text-muted-foreground';
  if (score >= 80) return 'text-emerald-500';
  if (score >= 60) return 'text-primary-500';
  return 'text-amber-500';
};

/** Memoized so re-filtering doesn't rebuild every card that didn't change. */
const HistoryCard = memo(({ mock }) => {
  const completed = mock.status === 'completed';
  return (
    <article className="group flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/30">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="capitalize">{mock.type}</Badge>
            <Badge variant="outline" className="capitalize">{mock.difficulty}</Badge>
          </div>
          <time
            className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            dateTime={mock.created_at}
            title={formatDateTime(mock.created_at)}
          >
            {timeAgo(mock.created_at)}
          </time>
        </div>

        <div>
          <h3 className="truncate text-base font-extrabold capitalize text-foreground">{mock.job_role}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{mock.experience_level} level</p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-3.5">
        <div className="flex items-center gap-1.5">
          <Award size={15} className={scoreTone(mock.overall_score)} />
          <span className={cn('text-sm font-bold tabular-nums', scoreTone(mock.overall_score))}>
            {mock.overall_score != null ? `${mock.overall_score}%` : 'Incomplete'}
          </span>
        </div>

        {completed ? (
          <Link
            to={`/interview/report/${mock.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-primary"
          >
            View evaluation
            <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <Button size="sm" variant="secondary" asChild>
            <Link to={`/interview/setup/${mock.id}`}>Resume session</Link>
          </Button>
        )}
      </div>
    </article>
  );
});
HistoryCard.displayName = 'HistoryCard';

const InterviewHistory = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/interviews/history');
        if (!cancelled) setHistory(res.data);
      } catch {
        if (!cancelled) setError('Failed to fetch interview history logs.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const completed = history.filter((h) => h.status === 'completed');
    const scored = completed.filter((h) => h.overall_score != null);
    const best = scored.reduce((m, h) => Math.max(m, h.overall_score), 0);
    const avg = scored.length
      ? Math.round(scored.reduce((s, h) => s + h.overall_score, 0) / scored.length)
      : 0;
    return { total: history.length, completed: completed.length, best, avg };
  }, [history]);

  const filteredHistory = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = history.filter((mock) => {
      const matchesSearch = !term || (mock.job_role || '').toLowerCase().includes(term);
      const matchesType = filterType === 'all' || (mock.type || '').toLowerCase() === filterType;
      return matchesSearch && matchesType;
    });
    // Sorted on a copy — filter() already returns one, but sorting the state array in place
    // would mutate what React is holding.
    return list.sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === 'highest_score') return (b.overall_score || 0) - (a.overall_score || 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [history, searchTerm, filterType, sortBy]);

  // Changing a filter/search/sort re-scopes the list, so send the user back to page 1 —
  // otherwise a narrowed result set would leave them on a page that no longer exists.
  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterType, sortBy]);

  const pagedHistory = useMemo(
    () => filteredHistory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredHistory, page]
  );

  const onSearch = useCallback((e) => setSearchTerm(e.target.value), []);

  if (loading) return <AdminPageSkeleton />;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={History}
        title="Mock Assessment History"
        subtitle="Every practice session you've run, with scores and full answer transcripts."
        actions={
          <Button size="sm" asChild>
            <Link to="/interview/start">
              <PlayCircle className="size-4" /> New session
            </Link>
          </Button>
        }
      >
        <AdminSearch value={searchTerm} onChange={onSearch} placeholder="Search by job role…">
          <div className="flex shrink-0 gap-2">
            <NativeSelect
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Filter by focus type"
              className="h-10 w-full sm:w-40"
            >
              <option value="all">All focus types</option>
              <option value="technical">Technical</option>
              <option value="hr">HR assessment</option>
              <option value="behavioral">Behavioral</option>
              <option value="custom">Custom JD</option>
            </NativeSelect>
            <NativeSelect
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort order"
              className="h-10 w-full sm:w-44"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="highest_score">Highest score</option>
            </NativeSelect>
          </div>
        </AdminSearch>
      </AdminPageHeader>

      {error && <Alert variant="error">{error}</Alert>}

      {history.length > 0 && (
        <StatGrid>
          {/* value + suffix rather than a pre-joined string: StatCard counts the number up,
              and a string would skip that animation and render as-is. */}
          <StatCard icon={History} label="Sessions" value={stats.total} index={0} />
          <StatCard icon={CheckCircle2} label="Completed" value={stats.completed} tone="success" index={1} />
          <StatCard icon={TrendingUp} label="Average score" value={stats.avg} suffix="%" tone="primary" index={2} />
          <StatCard icon={Award} label="Best score" value={stats.best} suffix="%" tone="warning" index={3} />
        </StatGrid>
      )}

      {filteredHistory.length === 0 ? (
        <AdminEmpty
          icon={History}
          title={history.length === 0 ? 'No sessions yet' : 'Nothing matches those filters'}
          message={
            history.length === 0
              ? 'Run a mock interview and it will show up here with its full evaluation.'
              : 'Try a different job role, focus type, or clear the search.'
          }
          filtered={history.length > 0}
          onClear={() => { setSearchTerm(''); setFilterType('all'); }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {pagedHistory.map((mock, i) => (
              <StaggerItem key={mock.id} index={i}>
                <HistoryCard mock={mock} />
              </StaggerItem>
            ))}
          </div>
          <Pagination page={page} total={filteredHistory.length} onChange={setPage} />
        </>
      )}
    </div>
  );
};

export default InterviewHistory;
