import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import Alert from '../components/ui/Alert';
import DeleteButton from '../components/ui/DeleteButton';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/shadcn/badge';
import { Separator } from '@/components/shadcn/misc';
import { StaggerItem } from '@/components/shadcn/motion';
import { StatCard, StatGrid } from '@/components/shadcn/stat-card';
import {
  AdminPageHeader,
  AdminSearch,
  AdminEmpty,
  AdminPageSkeleton,
} from '@/components/shadcn/page';
import { AdminFilter, facetOptions, applyFacets, hasActiveFilters } from '@/components/shadcn/filter';
import { MessageSquare, Star, Calendar, AlertTriangle, ThumbsUp } from 'lucide-react';

const AdminFeedbackPage = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});

  useEffect(() => {
    const fetchFeedbacks = async () => {
      try {
        const res = await api.get('/admin/feedback');
        setFeedbacks(res.data || []);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch platform feedbacks.');
      } finally {
        setLoading(false);
      }
    };
    fetchFeedbacks();
  }, []);

  const handleDelete = async (id) => {
    setError('');
    try {
      await api.delete(`/admin/feedback/${id}`);
      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete the feedback.');
    }
  };

  // Rating is stored as a number; the facet works in strings so the checklist, the URL
  // and the comparison all speak one type.
  const FACETS = {
    rating: (f) => String(f.rating ?? ''),
    issues: (f) => (f.issues_reported ? 'yes' : 'no'),
    job_role: (f) => f.job_role,
  };

  const filterGroups = useMemo(
    () => [
      {
        key: 'rating',
        label: 'Star rating',
        options: facetOptions(feedbacks, FACETS.rating, {
          order: ['5', '4', '3', '2', '1'],
          labels: { 5: '5 stars', 4: '4 stars', 3: '3 stars', 2: '2 stars', 1: '1 star' },
        }),
      },
      {
        key: 'issues',
        label: 'Technical issue',
        options: facetOptions(feedbacks, FACETS.issues, {
          order: ['yes', 'no'],
          labels: { yes: 'Issue reported', no: 'No issue' },
        }),
      },
      { key: 'job_role', label: 'Course / role', options: facetOptions(feedbacks, FACETS.job_role) },
    ],
    [feedbacks]
  );

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const bySearch = !q
      ? feedbacks
      : feedbacks.filter((f) =>
          [f.user_name, f.user_email, f.feedback_text, f.issues_reported]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        );
    return applyFacets(bySearch, filters, FACETS);
  }, [feedbacks, searchTerm, filters]);

  // Surfaced up front because they are the reason to open this page: an average tells you
  // whether the platform is working, and the issue count is the queue that needs action.
  const stats = useMemo(() => {
    if (!feedbacks.length) return { avg: null, withIssues: 0, positive: 0 };
    const total = feedbacks.reduce((s, f) => s + (f.rating || 0), 0);
    return {
      avg: total / feedbacks.length,
      withIssues: feedbacks.filter((f) => f.issues_reported).length,
      positive: feedbacks.filter((f) => (f.rating || 0) >= 4).length,
    };
  }, [feedbacks]);

  if (loading) return <AdminPageSkeleton rows={4} cols={3} />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={MessageSquare}
        title="Candidate Feedback"
        subtitle="Star ratings, written remarks and reported technical issues."
      >
        <AdminSearch
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by candidate, keywords, or reported issue…"
        >
          <AdminFilter groups={filterGroups} value={filters} onChange={setFilters} />
        </AdminSearch>
      </AdminPageHeader>

      {error && <Alert variant="error">{error}</Alert>}

      <StatGrid cols={3}>
        <StatCard
          index={0}
          label="Average Rating"
          formatted={stats.avg === null ? '—' : `${stats.avg.toFixed(1)} / 5`}
          icon={Star}
          tone={stats.avg >= 4 ? 'success' : stats.avg >= 3 ? 'warning' : 'danger'}
          hint={`${feedbacks.length} submission${feedbacks.length === 1 ? '' : 's'}`}
        />
        <StatCard index={1} label="Positive (4★+)" value={stats.positive} icon={ThumbsUp} tone="success" />
        <StatCard
          index={2}
          label="Issues Reported"
          value={stats.withIssues}
          icon={AlertTriangle}
          tone={stats.withIssues > 0 ? 'danger' : 'neutral'}
          hint={stats.withIssues > 0 ? 'needs review' : 'nothing outstanding'}
        />
      </StatGrid>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <AdminEmpty
            icon={MessageSquare}
            title={searchTerm ? 'No feedback matches your search' : 'No feedback yet'}
            message={
              searchTerm
                ? 'Try a different candidate name, keyword or issue.'
                : 'Candidate remarks will appear here once interviews are completed.'
            }
            filtered={!!searchTerm || hasActiveFilters(filters)}
            onClear={() => {
              setSearchTerm('');
              setFilters({});
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((item, idx) => (
            <StaggerItem key={item.id} index={idx}>
              <article className="flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-foreground">{item.user_name}</h4>
                    <span className="block truncate text-[11px] text-muted-foreground">{item.user_email}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Stars rating={item.rating} />
                    <DeleteButton
                      onConfirm={() => handleDelete(item.id)}
                      confirmMessage={`Delete this feedback from ${item.user_name} permanently?`}
                      title="Delete Feedback"
                    />
                  </div>
                </header>

                <Separator className="my-3" />

                {item.issues_reported && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                    <p className="text-[11px] leading-relaxed text-destructive">
                      <span className="font-bold">Reported issue: </span>
                      {item.issues_reported}
                    </p>
                  </div>
                )}

                <p className="flex-1 whitespace-pre-wrap text-xs font-medium leading-relaxed text-muted-foreground">
                  &ldquo;{item.feedback_text || 'No review remarks provided.'}&rdquo;
                </p>

                <footer className="mt-3 flex items-center justify-between gap-2 pt-2">
                  <Badge variant="secondary" size="sm" className="capitalize">
                    {item.job_role || 'unspecified'}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Calendar className="size-3" />
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </footer>
              </article>
            </StaggerItem>
          ))}
        </div>
      )}
    </div>
  );
};

const Stars = ({ rating = 0 }) => (
  <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
    {Array.from({ length: 5 }).map((_, i) => (
      <Star
        key={i}
        className={cn('size-3', i < rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25')}
      />
    ))}
  </span>
);

export default AdminFeedbackPage;
