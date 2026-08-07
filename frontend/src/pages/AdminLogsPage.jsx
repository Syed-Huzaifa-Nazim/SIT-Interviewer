import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Alert from '../components/ui/Alert';
import Pagination from '../components/ui/Pagination';
import DeleteButton from '../components/ui/DeleteButton';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shadcn/table';
import { UnderlineTabs } from '@/components/shadcn/tabs';
import { StaggerRow } from '@/components/shadcn/motion';
import { StatCard, StatGrid } from '@/components/shadcn/stat-card';
import {
  AdminPageHeader,
  AdminSearch,
  AdminEmpty,
  AdminPageSkeleton,
  AdminTableCard,
} from '@/components/shadcn/page';
import { AdminFilter, facetOptions, applyFacets, hasActiveFilters } from '@/components/shadcn/filter';
import {
  Activity,
  MailWarning,
  Video,
  Image as ImageIcon,
  ExternalLink,
  ScrollText,
  Filter,
} from 'lucide-react';

const PAGE_SIZE = 10;

// The archive stores three live capture kinds; 'termination' is the model's legacy column
// default and still appears on older rows, so it maps to the same label as 'webcam'.
const SNAPSHOT_KIND = {
  webcam: { label: 'Webcam', variant: 'destructive' },
  termination: { label: 'Webcam', variant: 'destructive' },
  identity: { label: 'Identity', variant: 'default' },
  screen: { label: 'Screen', variant: 'info' },
};

const SEARCH_PLACEHOLDER = {
  admin: 'Search by action, administrator or details…',
  email: 'Search by recipient, subject, type or status…',
  recordings: 'Search by candidate, status or interview id…',
  snapshots: 'Search by candidate, kind, context or interview id…',
};

const AdminLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [recordingLogs, setRecordingLogs] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // Keyed by tab: each stream has its own columns, so a filter chosen on Email must not
  // silently still be applied when the admin switches to Snapshots.
  const [filtersByTab, setFiltersByTab] = useState({});
  const [viewingId, setViewingId] = useState(null);
  const [page, setPage] = useState(1);

  // A deep-link from a report or profile ("show me the snapshots for THIS interview")
  // arrives with ?interview_id= — open the Snapshots tab and pre-filter server-side
  // rather than making the unfiltered 400-row call the tab normally does.
  const [searchParams] = useSearchParams();
  const interviewIdFilter = searchParams.get('interview_id');
  const [activeTab, setActiveTab] = useState(interviewIdFilter ? 'snapshots' : 'admin');

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchTerm, filtersByTab]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const [adminRes, emailRes, recRes] = await Promise.all([
          api.get('/admin/logs'),
          api.get('/admin/email-logs'),
          api.get('/admin/recording-logs'),
        ]);
        setLogs(adminRes.data || []);
        setEmailLogs(emailRes.data || []);
        setRecordingLogs(recRes.data || []);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch system audit logs.');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  // Snapshots are fetched on their own and RE-fetched whenever the interview_id filter
  // changes, including when it is cleared. Bundling them into the mount fetch above meant
  // "Show all snapshots" updated the URL but left the previously-filtered rows on screen,
  // and it re-requested three unrelated log streams for a change that affects only this one.
  useEffect(() => {
    api
      .get('/admin/proctor-snapshots', {
        params: interviewIdFilter ? { interview_id: interviewIdFilter } : {},
      })
      .then((res) => setSnapshots(res.data || []))
      .catch((err) => {
        console.error(err);
        setError('Failed to fetch proctoring snapshots.');
      });
  }, [interviewIdFilter]);

  const remove = useCallback(async (url, setter, id, failMessage) => {
    setError('');
    try {
      await api.delete(url);
      setter((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || failMessage);
    }
  }, []);

  const handleViewSnapshot = async (id) => {
    setError('');
    setViewingId(id);
    try {
      const res = await api.get(`/admin/proctor-snapshots/${id}/url`);
      // Signed URLs are short-lived, so they are opened straight into a new tab.
      window.open(res.data.image_url, '_blank', 'noopener');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not open this snapshot.');
    } finally {
      setViewingId(null);
    }
  };

  const match = useCallback(
    (fields) => {
      const q = searchTerm.toLowerCase();
      if (!q) return true;
      return fields.filter((v) => v !== null && v !== undefined).some((v) => String(v).toLowerCase().includes(q));
    },
    [searchTerm]
  );

  const filteredLogs = useMemo(
    () => logs.filter((l) => match([l.action, l.details, l.admin_name])),
    [logs, match]
  );
  const filteredEmails = useMemo(
    () => emailLogs.filter((l) => match([l.to_email, l.email_type, l.subject, l.status])),
    [emailLogs, match]
  );
  const filteredRecordings = useMemo(
    () => recordingLogs.filter((l) => match([l.candidate_email, l.status, l.interview_id])),
    [recordingLogs, match]
  );
  const filteredSnapshots = useMemo(
    () => snapshots.filter((s) => match([s.candidate_email, s.kind, s.label, s.interview_id])),
    [snapshots, match]
  );

  const failedCount = emailLogs.filter((l) => l.status === 'failed').length;
  const activeRecordings = recordingLogs.filter((l) => l.status === 'active').length;

  // Facet accessors per tab, so one filter control can serve four different streams.
  const FACETS_BY_TAB = {
    admin: { action: (l) => l.action, admin_name: (l) => l.admin_name },
    email: { status: (l) => l.status, email_type: (l) => l.email_type },
    recordings: { status: (l) => l.status },
    snapshots: { kind: (s) => s.kind },
  };

  const facets = FACETS_BY_TAB[activeTab] || {};
  const filters = filtersByTab[activeTab] || {};
  const setFilters = (next) => setFiltersByTab((prev) => ({ ...prev, [activeTab]: next }));

  const filterGroups = useMemo(() => {
    if (activeTab === 'admin') {
      return [
        { key: 'action', label: 'Action type', options: facetOptions(logs, facets.action) },
        { key: 'admin_name', label: 'Administrator', options: facetOptions(logs, facets.admin_name) },
      ];
    }
    if (activeTab === 'email') {
      return [
        {
          key: 'status',
          label: 'Delivery status',
          options: facetOptions(emailLogs, facets.status, {
            order: ['failed', 'sent'],
            labels: { failed: 'Failed', sent: 'Sent' },
          }),
        },
        { key: 'email_type', label: 'Email type', options: facetOptions(emailLogs, facets.email_type) },
      ];
    }
    if (activeTab === 'recordings') {
      return [
        {
          key: 'status',
          label: 'Recording status',
          options: facetOptions(recordingLogs, facets.status, {
            order: ['active', 'failed', 'deleted'],
            labels: { active: 'Active', failed: 'Failed', deleted: 'Deleted' },
          }),
        },
      ];
    }
    return [
      {
        key: 'kind',
        label: 'Capture type',
        options: facetOptions(snapshots, facets.kind, {
          order: ['webcam', 'screen', 'identity', 'termination'],
          labels: {
            webcam: 'Webcam frame',
            screen: 'Screen capture',
            identity: 'Identity check',
            termination: 'Webcam frame (legacy)',
          },
        }),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, logs, emailLogs, recordingLogs, snapshots]);

  const current = applyFacets(
    {
      admin: filteredLogs,
      email: filteredEmails,
      recordings: filteredRecordings,
      snapshots: filteredSnapshots,
    }[activeTab],
    filters,
    facets
  );

  const paged = current.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const tabs = [
    { value: 'admin', label: 'Admin Actions', icon: <Activity className="size-3.5" />, count: logs.length },
    { value: 'email', label: 'Email', icon: <MailWarning className="size-3.5" />, count: emailLogs.length },
    { value: 'recordings', label: 'Recordings', icon: <Video className="size-3.5" />, count: recordingLogs.length },
    { value: 'snapshots', label: 'Snapshots', icon: <ImageIcon className="size-3.5" />, count: snapshots.length },
  ];

  if (loading) return <AdminPageSkeleton rows={8} cols={5} />;

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={ScrollText}
        title="System Audit Trail"
        subtitle="Administrative actions, outbound email, recording lifecycle and proctoring captures."
      >
        <AdminSearch
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={SEARCH_PLACEHOLDER[activeTab]}
        >
          <AdminFilter groups={filterGroups} value={filters} onChange={setFilters} />
        </AdminSearch>
      </AdminPageHeader>

      {error && <Alert variant="error">{error}</Alert>}

      {interviewIdFilter && activeTab === 'snapshots' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-xs">
          <Filter className="size-3.5 shrink-0 text-primary" />
          <span className="text-foreground">
            Showing snapshots for <b>interview #{interviewIdFilter}</b> only.
          </span>
          <Button variant="link" size="sm" asChild className="h-auto p-0">
            <Link to="/admin/logs?tab=snapshots">Show all snapshots</Link>
          </Button>
        </div>
      )}

      <StatGrid cols={3}>
        <StatCard index={0} label="Admin Actions" value={logs.length} icon={Activity} tone="primary" />
        <StatCard
          index={1}
          label="Failed Emails"
          value={failedCount}
          icon={MailWarning}
          tone={failedCount > 0 ? 'danger' : 'success'}
          hint={failedCount > 0 ? 'needs investigation' : 'all delivered'}
        />
        <StatCard
          index={2}
          label="Active Recordings"
          value={activeRecordings}
          icon={Video}
          tone="accent"
          hint={`${recordingLogs.length} lifecycle entries`}
        />
      </StatGrid>

      <UnderlineTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} groupId="logs" />

      <AdminTableCard>
        {current.length === 0 ? (
          <AdminEmpty
            icon={ScrollText}
            title={searchTerm ? 'Nothing matches your search' : 'No entries recorded'}
            message={
              searchTerm ? 'Try a different term, or switch tabs.' : 'Activity will be logged here as it happens.'
            }
            filtered={!!searchTerm || hasActiveFilters(filters)}
            onClear={() => {
              setSearchTerm('');
              setFilters({});
            }}
          />
        ) : (
          <>
            {activeTab === 'admin' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden md:table-cell">Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="hidden sm:table-cell">Administrator</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((item, i) => (
                    <Row key={item.id} index={i}>
                      <TableCell className="hidden font-mono text-[11px] text-muted-foreground md:table-cell">
                        {fmt(item.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" size="sm" className="font-mono">
                          {item.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="font-semibold text-foreground">{item.admin_name}</div>
                        <div className="text-[11px] text-muted-foreground">{item.admin_email}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.details}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <DeleteButton
                            onConfirm={() => remove(`/admin/logs/${item.id}`, setLogs, item.id, 'Failed to delete the log entry.')}
                            confirmMessage="Delete this audit log entry permanently?"
                            title="Delete Log"
                          />
                        </div>
                      </TableCell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            )}

            {activeTab === 'email' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden md:table-cell">Timestamp</TableHead>
                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead className="hidden lg:table-cell">Subject</TableHead>
                    <TableHead className="text-center">Attempts</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((item, i) => (
                    <Row key={item.id} index={i}>
                      <TableCell className="hidden font-mono text-[11px] text-muted-foreground md:table-cell">
                        {fmt(item.created_at)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" size="sm">
                          {item.email_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{item.to_email}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{item.subject}</TableCell>
                      <TableCell className="text-center font-mono text-muted-foreground">{item.attempts}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'sent' ? 'success' : 'destructive'} size="sm">
                          {item.status}
                        </Badge>
                        {item.status === 'failed' && item.error && (
                          <p className="mt-1 max-w-[16rem] text-[10px] leading-snug text-destructive">{item.error}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <DeleteButton
                            onConfirm={() =>
                              remove(`/admin/email-logs/${item.id}`, setEmailLogs, item.id, 'Failed to delete the email log.')
                            }
                            confirmMessage="Delete this email log entry permanently?"
                            title="Delete Email Log"
                          />
                        </div>
                      </TableCell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            )}

            {activeTab === 'recordings' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead className="text-center">Interview</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Deleted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((item, i) => (
                    <Row key={item.id} index={i}>
                      <TableCell className="hidden font-mono text-[11px] text-muted-foreground md:table-cell">
                        {fmt(item.created_at)}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{item.candidate_email || '—'}</TableCell>
                      <TableCell className="text-center">
                        {item.interview_id ? (
                          <Button variant="link" size="sm" asChild className="h-auto p-0 font-mono">
                            <Link to={`/interview/report/${item.interview_id}`}>#{item.interview_id}</Link>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          size="sm"
                          variant={
                            item.status === 'active' ? 'success' : item.status === 'failed' ? 'destructive' : 'secondary'
                          }
                        >
                          {item.status === 'active' ? 'Active' : item.status === 'failed' ? 'Failed' : 'Deleted'}
                        </Badge>
                        {item.status === 'failed' && item.error && (
                          <p className="mt-1 max-w-[16rem] text-[10px] leading-snug text-destructive">{item.error}</p>
                        )}
                      </TableCell>
                      <TableCell className="hidden font-mono text-[11px] text-muted-foreground lg:table-cell">
                        {fmt(item.deleted_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <DeleteButton
                            onConfirm={() =>
                              remove(
                                `/admin/recording-logs/${item.id}`,
                                setRecordingLogs,
                                item.id,
                                'Failed to delete the recording log.'
                              )
                            }
                            confirmMessage="Delete this recording log entry permanently?"
                            title="Delete Recording Log"
                          />
                        </div>
                      </TableCell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            )}

            {activeTab === 'snapshots' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden md:table-cell">Captured</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead className="text-center">Interview</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Context</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((item, i) => (
                    <Row key={item.id} index={i}>
                      <TableCell className="hidden font-mono text-[11px] text-muted-foreground md:table-cell">
                        {fmt(item.captured_at)}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{item.candidate_email || '—'}</TableCell>
                      <TableCell className="text-center">
                        {item.interview_id ? (
                          <Button variant="link" size="sm" asChild className="h-auto p-0 font-mono">
                            <Link to={`/interview/report/${item.interview_id}`}>#{item.interview_id}</Link>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={SNAPSHOT_KIND[item.kind]?.variant ?? 'info'} size="sm">
                          {SNAPSHOT_KIND[item.kind]?.label ?? 'Screen'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{item.label || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={viewingId === item.id}
                            onClick={() => handleViewSnapshot(item.id)}
                          >
                            <ExternalLink />
                            {viewingId === item.id ? 'Opening…' : 'View'}
                          </Button>
                          <DeleteButton
                            onConfirm={() =>
                              remove(
                                `/admin/proctor-snapshots/${item.id}`,
                                setSnapshots,
                                item.id,
                                'Failed to delete the snapshot.'
                              )
                            }
                            confirmMessage="Delete this proctoring snapshot permanently?"
                            title="Delete Snapshot"
                          />
                        </div>
                      </TableCell>
                    </Row>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className={cn('border-t border-border px-3')}>
              <Pagination page={page} total={current.length} onChange={setPage} />
            </div>
          </>
        )}
      </AdminTableCard>
    </div>
  );
};

const Row = ({ index, children }) => (
  <StaggerRow index={index} className="border-b border-border align-top transition-colors hover:bg-accent/60">
    {children}
  </StaggerRow>
);

export default AdminLogsPage;
