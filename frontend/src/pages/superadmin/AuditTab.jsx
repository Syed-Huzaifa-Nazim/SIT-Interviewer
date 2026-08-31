import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Button } from '@/components/shadcn/button';
import { Badge } from '@/components/shadcn/badge';
import { Input, Label, NativeSelect } from '@/components/shadcn/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/shadcn/table';
import { AdminEmpty, AdminTableCard } from '@/components/shadcn/page';
import superAdminApi from '../../services/superAdminApi';

/**
 * The platform-wide audit trail.
 *
 * The Admin Hub has a log too, but it is scoped to the reader's own actions — an entry's
 * `details` names candidates in free text, so one admin's entries can carry another
 * company's data. The super admin is the one person for whom reading across all of them is
 * not a leak, and they already see every company. Without this view there is nobody who can
 * answer "who touched this candidate", which is the only question an audit trail exists for.
 *
 * It is paged rather than capped. A hard limit silently hides exactly the older entry
 * somebody came here looking for.
 */

const PAGE_SIZE = 50;

const ROLE_VARIANT = {
  super_admin: 'default',
  admin: 'secondary',
  api_key: 'info',
};

const AuditTab = ({ admins, onError }) => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({ admin_id: '', action: '', actor_role: '', search: '' });
  // Applied separately from what is typed, so every keystroke does not fire a request at a
  // table that can be large.
  const [applied, setApplied] = useState(filters);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset };
      Object.entries(applied).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      const res = await superAdminApi.get('/superadmin/audit-log', { params });
      setRows(res.data.data);
      setTotal(res.data.pagination.total);
    } catch (err) {
      onError(err.response?.data?.message || 'Could not load the audit log.');
    } finally {
      setLoading(false);
    }
  }, [applied, offset, onError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    superAdminApi
      .get('/superadmin/audit-log/actions')
      .then((res) => setActions(res.data))
      .catch(() => setActions([]));
  }, []);

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const apply = (e) => {
    e.preventDefault();
    // Back to the first page: staying on page 4 of the old result set would show an empty
    // table and read as "no matches".
    setOffset(0);
    setApplied(filters);
  };

  const clear = () => {
    const blank = { admin_id: '', action: '', actor_role: '', search: '' };
    setFilters(blank);
    setApplied(blank);
    setOffset(0);
  };

  const filtered = Object.values(applied).some(Boolean);
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <form onSubmit={apply} className="rounded-xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="audit-search">Search details</Label>
            <Input
              id="audit-search"
              value={filters.search}
              onChange={set('search')}
              placeholder="An email, a name, an id…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-actor">Who</Label>
            <NativeSelect id="audit-actor" value={filters.admin_id} onChange={set('admin_id')}>
              <option value="">Anyone</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.email})
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-action">Action</Label>
            <NativeSelect id="audit-action" value={filters.action} onChange={set('action')}>
              <option value="">Any action</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audit-role">Acting as</Label>
            <NativeSelect id="audit-role" value={filters.actor_role} onChange={set('actor_role')}>
              <option value="">Any role</option>
              <option value="super_admin">Super admin</option>
              <option value="admin">Admin</option>
              <option value="api_key">API key</option>
            </NativeSelect>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button type="submit" size="sm">
            Apply
          </Button>
          {filtered && (
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <X className="size-3.5" />
              Clear
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
          </span>
        </div>
      </form>

      <AdminTableCard>
        {rows.length === 0 && !loading ? (
          <AdminEmpty
            icon={ScrollText}
            title={filtered ? 'Nothing matches those filters' : 'The audit log is empty'}
            message={
              filtered
                ? 'Try widening the search, or clear the filters to see everything.'
                : 'Actions taken by administrators and API keys are recorded here as they happen.'
            }
            filtered={filtered}
            onClear={clear}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold text-foreground">
                      {r.actor_name || r.actor_email}
                    </div>
                    {r.api_key_name ? (
                      // An API key acted, not a person. Showing only the key's creator
                      // would name somebody who may have been asleep at the time.
                      <div className="text-[10px] text-muted-foreground">
                        via key “{r.api_key_name}” ({r.api_key_prefix}…)
                      </div>
                    ) : (
                      <div className="text-[10px] text-muted-foreground">{r.actor_email}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <code className="text-[11px] font-semibold text-foreground">
                        {r.action}
                      </code>
                      {r.actor_role && (
                        <Badge variant={ROLE_VARIANT[r.actor_role] || 'secondary'}>
                          {r.actor_role.replace('_', ' ')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.details}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminTableCard>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="size-4" />
              Newer
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + PAGE_SIZE >= total || loading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Older
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Every company, every administrator and every API key. The Admin Hub&apos;s own log
        shows each admin only their own actions — this is the only view that spans them all.
      </p>
    </div>
  );
};

export default AuditTab;
