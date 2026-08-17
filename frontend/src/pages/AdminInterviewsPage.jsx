import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Alert from '../components/ui/Alert';
import Pagination from '../components/ui/Pagination';
import DeleteButton from '../components/ui/DeleteButton';
import { cn } from '@/lib/utils';
import { Badge, StatusBadge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shadcn/table';
import { StaggerRow } from '@/components/shadcn/motion';
import { StatCard, StatGrid } from '@/components/shadcn/stat-card';
import { scoreColor } from '@/components/shadcn/chart';
import {
  AdminPageHeader,
  AdminSearch,
  AdminEmpty,
  AdminPageSkeleton,
  AdminTableCard,
} from '@/components/shadcn/page';
import { AdminFilter, facetOptions, applyFacets, hasActiveFilters } from '@/components/shadcn/filter';
import { Video, ShieldAlert, ArrowRight, Calendar, CheckCircle2, Activity } from 'lucide-react';

const PAGE_SIZE = 10;

// 'terminated' is a proctor outcome rather than a status value, so outcome is derived
// once here and every consumer (facet options, filtering, counts) reads the same rule.
const outcomeOf = (i) => (i.is_proctor_failed ? 'terminated' : i.status === 'completed' ? 'completed' : i.status);

const AdminInterviewsPage = () => {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filters]);

  useEffect(() => {
    const fetchInterviews = async () => {
      try {
        const res = await api.get('/admin/interviews');
        setInterviews(res.data || []);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch interview session history.');
      } finally {
        setLoading(false);
      }
    };
    fetchInterviews();
  }, []);

  const handleDelete = async (id) => {
    setError('');
    try {
      await api.delete(`/admin/interviews/${id}`);
      setInterviews((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete the interview.');
    }
  };

  const FACETS = {
    outcome: outcomeOf,
    type: (i) => i.type,
    difficulty: (i) => i.difficulty,
    job_role: (i) => i.job_role,
  };

  const filterGroups = useMemo(
    () => [
      {
        key: 'outcome',
        label: 'Outcome',
        options: facetOptions(interviews, FACETS.outcome, {
          order: ['completed', 'terminated', 'active'],
          labels: { completed: 'Completed', terminated: 'Terminated', active: 'In progress' },
        }),
      },
      { key: 'job_role', label: 'Job role', options: facetOptions(interviews, FACETS.job_role) },
      { key: 'type', label: 'Type', options: facetOptions(interviews, FACETS.type) },
      { key: 'difficulty', label: 'Difficulty', options: facetOptions(interviews, FACETS.difficulty) },
    ],
    [interviews]
  );

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    const bySearch = !q
      ? interviews
      : interviews.filter((i) =>
          [i.user_name, i.user_email, i.job_role, i.type]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        );
    return applyFacets(bySearch, filters, FACETS);
  }, [interviews, searchTerm, filters]);

  const stats = useMemo(() => {
    const completed = interviews.filter((i) => outcomeOf(i) === 'completed').length;
    const terminated = interviews.filter((i) => outcomeOf(i) === 'terminated').length;
    const active = interviews.filter((i) => i.status === 'active' && !i.is_proctor_failed).length;
    return { completed, terminated, active };
  }, [interviews]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <AdminPageSkeleton rows={7} cols={5} />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Video}
        title="Interview Sessions"
        subtitle="Audit candidate performance, scores and proctoring outcomes."
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

      <StatGrid cols={3}>
        <StatCard index={0} label="Completed" value={stats.completed} icon={CheckCircle2} tone="success" />
        <StatCard
          index={1}
          label="Terminated"
          value={stats.terminated}
          icon={ShieldAlert}
          tone={stats.terminated > 0 ? 'danger' : 'neutral'}
          hint="proctor integrity failures"
        />
        <StatCard index={2} label="In Progress" value={stats.active} icon={Activity} tone="primary" />
      </StatGrid>

      <AdminTableCard>
        {filtered.length === 0 ? (
          <AdminEmpty
            icon={Video}
            title={searchTerm || hasActiveFilters(filters) ? 'No sessions match your filters' : 'No interviews recorded'}
            message={
              searchTerm || hasActiveFilters(filters)
                ? 'Try a different search term or filter.'
                : 'Candidate sessions will appear here once interviews begin.'
            }
            filtered={!!searchTerm || hasActiveFilters(filters)}
            onClear={() => {
              setSearchTerm('');
              setFilters({});
            }}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead className="hidden md:table-cell">Role &amp; Focus</TableHead>
                  <TableHead>Status &amp; Score</TableHead>
                  <TableHead className="text-center">Integrity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((item, i) => (
                  <StaggerRow
                    key={item.id}
                    index={i}
                    className="border-b border-border transition-colors hover:bg-accent/60"
                  >
                    <TableCell>
                      <Link
                        to={`/admin/users/${item.user_id}`}
                        state={{ from: 'Interviews' }}
                        className="block hover:underline"
                      >
                        <div className="font-semibold text-foreground">{item.user_name}</div>
                        <div className="text-[11px] text-muted-foreground">{item.user_email}</div>
                      </Link>
                    </TableCell>

                    <TableCell className="hidden md:table-cell">
                      <div className="font-semibold capitalize text-foreground">{item.job_role}</div>
                      <div className="text-[11px] capitalize text-muted-foreground">
                        {item.type} · {item.difficulty}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.status === 'completed' ? (
                          <Badge variant="success" size="sm">
                            completed
                          </Badge>
                        ) : (
                          <StatusBadge variant="warning" size="sm" pulse>
                            {item.status}
                          </StatusBadge>
                        )}
                        {item.status === 'completed' && item.overall_score !== null && (
                          <span
                            className="font-mono text-sm font-bold"
                            style={{ color: scoreColor(item.overall_score) }}
                          >
                            {item.overall_score}%
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Calendar className="size-3" />
                        {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      {item.is_proctor_failed ? (
                        <Badge variant="destructive" size="sm">
                          <ShieldAlert /> Terminated
                        </Badge>
                      ) : item.proctor_violations_count > 0 ? (
                        <Badge variant="warning" size="sm">
                          {item.proctor_violations_count} warning{item.proctor_violations_count === 1 ? '' : 's'}
                        </Badge>
                      ) : (
                        <span className="text-[11px] font-semibold text-muted-foreground">Clean</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {item.status === 'completed' ? (
                          <Button variant="outline" size="icon-sm" asChild title="Inspect scorecard">
                            <Link to={`/interview/report/${item.id}`} aria-label="Inspect scorecard">
                              <ArrowRight />
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-[11px] italic text-muted-foreground">Awaiting</span>
                        )}
                        <DeleteButton
                          onConfirm={() => handleDelete(item.id)}
                          confirmMessage={`Permanently delete ${item.user_name}'s ${item.job_role} interview and its report? This cannot be undone.`}
                          title="Delete Interview"
                        />
                      </div>
                    </TableCell>
                  </StaggerRow>
                ))}
              </TableBody>
            </Table>
            <div className={cn('border-t border-border px-3')}>
              <Pagination page={page} total={filtered.length} onChange={setPage} />
            </div>
          </>
        )}
      </AdminTableCard>
    </div>
  );
};

export default AdminInterviewsPage;
