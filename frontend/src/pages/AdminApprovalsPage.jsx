import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Alert from '../components/ui/Alert';
import Pagination from '../components/ui/Pagination';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shadcn/table';
import { StaggerItem, StaggerRow, GradientBorderCard } from '@/components/shadcn/motion';
import { scoreColor } from '@/components/shadcn/chart';
import {
  AdminPageHeader,
  AdminEmpty,
  AdminPageSkeleton,
  AdminTableCard,
} from '@/components/shadcn/page';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/shadcn/dialog';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ArrowRight,
  Clock,
  History,
} from 'lucide-react';

const PAGE_SIZE = 10;

/**
 * Second-interview approval queue. A decision emails the candidate automatically —
 * fresh one-time credentials on approve, an ineligibility notice on reject — so the
 * confirmation step spells out which email is about to go out.
 */
const AdminApprovalsPage = () => {
  const [pending, setPending] = useState([]);
  const [decided, setDecided] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actingId, setActingId] = useState(null);
  const [page, setPage] = useState(1);
  // { req, decision } — drives the confirm dialog. Replaces window.confirm, which cannot
  // show the candidate's history and is trivially dismissed by muscle memory.
  const [confirming, setConfirming] = useState(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await api.get('/admin/reinterview-requests');
      setPending(res.data.pending || []);
      setDecided(res.data.decided || []);
    } catch (err) {
      console.error(err);
      setError('Failed to load second-interview requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const decide = async () => {
    if (!confirming) return;
    const { req, decision } = confirming;
    setActingId(req.id);
    setError('');
    setNotice('');
    setConfirming(null);
    try {
      const res = await api.post(`/admin/reinterview-requests/${req.id}/decision`, { decision });
      setNotice(res.data.message || 'Decision recorded.');
      await fetchRequests();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record the decision.');
    } finally {
      setActingId(null);
    }
  };

  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

  if (loading) return <AdminPageSkeleton rows={4} cols={5} />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={ClipboardCheck}
        title="Second-Interview Approvals"
        subtitle="Decisions email the candidate automatically — credentials on approve, an ineligibility notice on reject."
        actions={
          pending.length > 0 ? (
            <Badge variant="warning" size="lg">
              <Clock /> {pending.length} awaiting decision
            </Badge>
          ) : (
            <Badge variant="success" size="lg">
              <CheckCircle2 /> Queue clear
            </Badge>
          )
        }
      />

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {/* ------------------------------------------------------------ pending */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-foreground">
          Pending Requests
          {pending.length > 0 && <Badge variant="warning">{pending.length}</Badge>}
        </h3>

        {pending.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <AdminEmpty
              icon={ClipboardCheck}
              title="Nothing awaiting a decision"
              message="When a previously-interviewed candidate signs up again, their request appears here."
            />
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((req, idx) => (
              <StaggerItem key={req.id} index={idx}>
                <GradientBorderCard>
                  <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-foreground">{req.name}</span>
                        <Badge variant="default" size="sm" className="font-mono">
                          {req.cnic}
                        </Badge>
                        {req.course_category && (
                          <Badge variant="secondary" size="sm">
                            {req.course_category}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{req.email}</div>

                      <dl className="flex flex-wrap gap-x-5 gap-y-1 pt-0.5 text-xs text-muted-foreground">
                        <span>
                          Requested <b className="text-foreground">{fmtDate(req.requested_at)}</b>
                        </span>
                        <span>
                          First interview{' '}
                          <b className="text-foreground">
                            {req.first_interview_date
                              ? new Date(req.first_interview_date).toLocaleDateString()
                              : 'on record'}
                          </b>
                        </span>
                        <span>
                          First score{' '}
                          <b style={{ color: scoreColor(req.first_interview_score) }}>
                            {req.first_interview_score !== null && req.first_interview_score !== undefined
                              ? `${req.first_interview_score}%`
                              : 'N/A'}
                          </b>
                        </span>
                      </dl>

                      {req.first_interview_proctor_failed && (
                        <div className="inline-flex items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1 text-[11px] font-semibold text-destructive">
                          <ShieldAlert className="size-3.5" />
                          First attempt was terminated by proctoring
                        </div>
                      )}

                      {req.first_interview_id && (
                        <div>
                          <Button variant="link" size="sm" asChild className="h-auto p-0">
                            <Link to={`/interview/report/${req.first_interview_id}`}>
                              Review first interview <ArrowRight />
                            </Link>
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => setConfirming({ req, decision: 'approve' })}
                        disabled={actingId !== null}
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 /> Approve
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setConfirming({ req, decision: 'reject' })}
                        disabled={actingId !== null}
                      >
                        <XCircle /> Reject
                      </Button>
                    </div>
                  </div>
                </GradientBorderCard>
              </StaggerItem>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ history */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-foreground">
          <History className="size-4" /> Decision History
        </h3>
        <AdminTableCard>
          {decided.length === 0 ? (
            <AdminEmpty icon={History} title="No decisions yet" message="Approved and rejected requests are recorded here." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead className="hidden sm:table-cell">CNIC</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead className="hidden md:table-cell">Decided By</TableHead>
                    <TableHead className="hidden lg:table-cell">Decided At</TableHead>
                    <TableHead className="text-right">Links</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decided.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((req, i) => (
                    <StaggerRow key={req.id} index={i} className="border-b border-border transition-colors hover:bg-accent/60">
                      <TableCell>
                        <div className="font-semibold text-foreground">{req.name}</div>
                        <div className="text-[11px] text-muted-foreground">{req.email}</div>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">{req.cnic}</TableCell>
                      <TableCell>
                        <Badge variant={req.status === 'approved' ? 'success' : 'destructive'} size="sm">
                          {req.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {req.decided_by_name || '—'}
                      </TableCell>
                      <TableCell className="hidden text-[11px] text-muted-foreground lg:table-cell">
                        {fmtDate(req.decided_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {req.first_interview_id && (
                          <Button variant="link" size="sm" asChild className="h-auto p-0">
                            <Link to={`/interview/report/${req.first_interview_id}`}>Report</Link>
                          </Button>
                        )}
                      </TableCell>
                    </StaggerRow>
                  ))}
                </TableBody>
              </Table>
              <div className={cn('border-t border-border px-3')}>
                <Pagination page={page} total={decided.length} onChange={setPage} />
              </div>
            </>
          )}
        </AdminTableCard>
      </section>

      {/* ---------------------------------------------------- confirm dialog */}
      <Dialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {confirming?.decision === 'approve' ? 'Approve second interview?' : 'Reject second interview?'}
            </DialogTitle>
            <DialogDescription>
              {confirming?.decision === 'approve'
                ? 'A fresh one-time password will be emailed to the candidate automatically.'
                : 'The candidate will be emailed that they are not eligible for a second interview.'}
            </DialogDescription>
          </DialogHeader>

          {confirming && (
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <div className="font-bold text-foreground">{confirming.req.name}</div>
              <div className="text-muted-foreground">{confirming.req.email}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-muted-foreground">
                <span className="font-mono">{confirming.req.cnic}</span>
                <span>
                  First score{' '}
                  <b style={{ color: scoreColor(confirming.req.first_interview_score) }}>
                    {confirming.req.first_interview_score ?? 'N/A'}
                    {confirming.req.first_interview_score != null ? '%' : ''}
                  </b>
                </span>
                {confirming.req.first_interview_proctor_failed && (
                  <span className="font-semibold text-destructive">First attempt terminated</span>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button
              size="sm"
              variant={confirming?.decision === 'approve' ? 'default' : 'destructive'}
              onClick={decide}
              className={confirming?.decision === 'approve' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
            >
              {confirming?.decision === 'approve' ? (
                <>
                  <CheckCircle2 /> Approve &amp; email credentials
                </>
              ) : (
                <>
                  <XCircle /> Reject &amp; notify
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminApprovalsPage;
