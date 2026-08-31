import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  Building2,
  Users,
  UserPlus,
  UserMinus,
  LogOut,
  Plus,
  Archive,
  ArchiveRestore,
  Pencil,
  KeyRound,
  Inbox,
  ArrowRight,
  Star,
  LifeBuoy,
  KeySquare,
  ScrollText,
} from 'lucide-react';

import Alert from '../../components/ui/Alert';
import Spinner from '../../components/ui/Spinner';
import ThemeToggle from '../../components/layout/ThemeToggle';
import BrandLogo from '../../components/layout/BrandLogo';
import { Button } from '@/components/shadcn/button';
import { Badge } from '@/components/shadcn/badge';
import { Input, Label, NativeSelect } from '@/components/shadcn/input';
import { UnderlineTabs } from '@/components/shadcn/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/shadcn/table';
import { AdminPageHeader, AdminEmpty, AdminTableCard } from '@/components/shadcn/page';
import SecretPanel from './SecretPanel';
import ConfirmAction from './ConfirmAction';
import ApiKeysTab from './ApiKeysTab';
import AuditTab from './AuditTab';
import superAdminApi, {
  readSuperAdminSession,
  clearSuperAdminSession,
} from '../../services/superAdminApi';

/**
 * The management portal: companies, administrators, and the candidates nobody owns yet.
 *
 * These three lists are one page rather than three because they are one job. Creating a
 * company is only useful once an admin holds it, and an admin who holds nothing sees an
 * empty Admin Hub — the sequence only makes sense together, and splitting it across routes
 * made each step look complete on its own when it was not.
 */

const TABS = [
  { value: 'companies', label: 'Companies', icon: <Building2 className="size-4" /> },
  { value: 'admins', label: 'Administrators', icon: <Users className="size-4" /> },
  { value: 'unassigned', label: 'Unassigned', icon: <Inbox className="size-4" /> },
  { value: 'apikeys', label: 'API keys', icon: <KeySquare className="size-4" /> },
  { value: 'audit', label: 'Audit', icon: <ScrollText className="size-4" /> },
];

const SuperAdminPortal = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const session = readSuperAdminSession();

  const [tab, setTab] = useState('companies');
  const [companies, setCompanies] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  // Plaintext recovery codes, held only long enough to be written down.
  const [newCodes, setNewCodes] = useState(null);
  const [me, setMe] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      // One trip each, in parallel: the three lists are independent and the portal is
      // useless until all three have arrived, so serialising them only adds latency.
      const [c, a, u, m] = await Promise.all([
        superAdminApi.get('/superadmin/companies'),
        superAdminApi.get('/superadmin/admins'),
        superAdminApi.get('/superadmin/unassigned-users'),
        superAdminApi.get('/superadmin/me'),
      ]);
      setCompanies(c.data);
      setAdmins(a.data);
      setUnassigned(u.data);
      setMe(m.data);
    } catch (err) {
      // A 401 is already handled by the interceptor (it redirects to the sign-in page), so
      // anything reaching here is a real failure worth showing.
      setError(err.response?.data?.message || 'Could not load the management data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      navigate('/superadmin/login', { replace: true });
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    clearSuperAdminSession();
    navigate('/superadmin/login', { replace: true });
  };

  const regenerateCodes = async () => {
    // Not through `run`: that helper discards the response, and the response is the only
    // copy of these codes that will ever exist.
    setBusy(true);
    setError('');
    try {
      const res = await superAdminApi.post('/superadmin/recovery-codes/regenerate');
      setNewCodes(res.data.codes);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not generate recovery codes.');
    } finally {
      setBusy(false);
    }
  };

  /** Run one mutation, then reload. Every action here changes what somebody else can see,
   *  so the lists are re-fetched rather than patched locally — a stale count on this page
   *  is a wrong answer about access. */
  const run = async (fn, successMessage) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await load();
      if (successMessage) setNotice(successMessage);
    } catch (err) {
      setError(err.response?.data?.message || 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const activeCompanies = useMemo(
    () => companies.filter((c) => c.status !== 'archived'),
    [companies]
  );

  const tabsWithCounts = TABS.map((t) => ({
    ...t,
    count:
      t.value === 'companies'
        ? companies.length
        : t.value === 'admins'
          ? admins.length
          : t.value === 'unassigned'
            ? unassigned.length
            // The key list is loaded by the tab itself, so there is no count to show until
            // it has been opened. Better no badge than a wrong one.
            : undefined,
  }));

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin">
                Admin Hub
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-5 py-6">
        <AdminPageHeader
          icon={ShieldCheck}
          title="Super Admin"
          subtitle={
            session?.user?.email
              ? `Signed in as ${session.user.email}`
              : 'Companies, administrators, and who can see whom.'
          }
          actions={
            <Button variant="outline" size="sm" disabled={busy} onClick={regenerateCodes}>
              <LifeBuoy className="size-4" />
              Recovery codes
              {me != null && (
                <Badge variant={me.recovery_codes_remaining > 0 ? 'secondary' : 'destructive'}>
                  {me.recovery_codes_remaining}
                </Badge>
              )}
            </Button>
          }
        />

        {error && <Alert variant="error">{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}

        {location.state?.recoveryCodesRemaining != null && (
          <Alert variant="warning">
            You signed in with a recovery code, so that code is now spent.{' '}
            <strong>{location.state.recoveryCodesRemaining} left.</strong> If you reached for
            one because the email never arrived, the delivery problem is still there — the
            next sign-in will need another.
          </Alert>
        )}

        {newCodes && (
          <SecretPanel
            title="Your new recovery codes"
            description="Save these somewhere that is not this system. Each works once, and they replace every code issued before. Only hashes are kept, so this is the only time they can be read."
            values={newCodes}
            onDone={() => setNewCodes(null)}
          />
        )}

        {!newCodes && me && me.recovery_codes_remaining === 0 && (
          <Alert variant="warning">
            You have no recovery codes. The second factor arrives by email, and this system
            has had delivery failures before — without a code saved, an email outage locks
            everyone out of administration entirely.{' '}
            <button
              type="button"
              onClick={regenerateCodes}
              disabled={busy}
              className="font-semibold underline underline-offset-2"
            >
              Generate them now
            </button>
            .
          </Alert>
        )}

        <UnderlineTabs
          tabs={tabsWithCounts}
          value={tab}
          onValueChange={setTab}
          groupId="superadmin"
        />

        {tab === 'companies' && (
          <CompaniesTab companies={companies} busy={busy} run={run} />
        )}
        {tab === 'admins' && (
          <AdminsTab
            admins={admins}
            companies={activeCompanies}
            busy={busy}
            run={run}
            selfId={session?.user?.id}
          />
        )}
        {tab === 'unassigned' && (
          <UnassignedTab
            users={unassigned}
            companies={activeCompanies}
            busy={busy}
            run={run}
          />
        )}
        {tab === 'apikeys' && (
          <ApiKeysTab
            companies={activeCompanies}
            busy={busy}
            setBusy={setBusy}
            onError={setError}
          />
        )}
        {tab === 'audit' && <AuditTab admins={admins} onError={setError} />}
      </main>
    </div>
  );
};

/* ------------------------------------------------------------------ Companies */

function CompaniesTab({ companies, busy, run }) {
  const [name, setName] = useState('');

  const create = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    run(
      () => superAdminApi.post('/superadmin/companies', { name: trimmed }),
      `Created ${trimmed}.`
    ).then(() => setName(''));
  };

  const rename = (company) => {
    const next = window.prompt('New name for this company', company.name);
    if (next === null) return;
    if (!next.trim() || next.trim() === company.name) return;
    run(
      () => superAdminApi.put(`/superadmin/companies/${company.id}`, { name: next.trim() }),
      'Company renamed.'
    );
  };

  const setStatus = (company, status) =>
    run(
      () => superAdminApi.put(`/superadmin/companies/${company.id}`, { status }),
      status === 'archived' ? `${company.name} archived.` : `${company.name} restored.`
    );

  const makeDefault = (company) =>
    run(
      () => superAdminApi.put(`/superadmin/companies/${company.id}`, { is_default: true }),
      `New signups now join ${company.name}.`
    );

  const hasDefault = companies.some((c) => c.is_default);

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="new-company">New company</Label>
          <Input
            id="new-company"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corporation"
            maxLength={150}
          />
        </div>
        <Button type="submit" disabled={busy || !name.trim()}>
          <Plus className="size-4" />
          Create
        </Button>
      </form>

      <AdminTableCard>
        {companies.length === 0 ? (
          <AdminEmpty
            icon={Building2}
            title="No companies yet"
            message="Create one, then grant it to an administrator. Until a company exists, every candidate stays unassigned and only you can see them."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Admins</TableHead>
                <TableHead>Candidates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => {
                const archived = c.status === 'archived';
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-semibold text-foreground">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.slug}</div>
                    </TableCell>
                    <TableCell>{c.admin_count}</TableCell>
                    <TableCell>{c.candidate_count}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={archived ? 'secondary' : 'default'}>
                          {archived ? 'Archived' : 'Active'}
                        </Badge>
                        {c.is_default && (
                          <Badge variant="info" className="gap-1">
                            <Star className="size-3" />
                            Signups
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => rename(c)}
                        >
                          <Pencil className="size-3.5" />
                          Rename
                        </Button>
                        {!archived && !c.is_default && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => makeDefault(c)}
                          >
                            <Star className="size-3.5" />
                            Take signups
                          </Button>
                        )}
                        {archived ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => setStatus(c, 'active')}
                          >
                            <ArchiveRestore className="size-3.5" />
                            Restore
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => setStatus(c, 'archived')}
                          >
                            <Archive className="size-3.5" />
                            Archive
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </AdminTableCard>

      {companies.length > 0 && !hasDefault && (
        <Alert variant="warning">
          No company is taking public signups, so everyone who enrols through the signup form
          lands in <strong>Unassigned</strong> — where only you can see them. Choose a company
          with &ldquo;Take signups&rdquo;.
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        Companies are archived, never deleted. Deleting one would either orphan its
        candidates or take their interview records with it, and neither belongs behind a
        single button. Archiving hides it from new assignments, clears it from taking
        signups, and changes nothing else.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ Administrators */

function AdminsTab({ admins, companies, busy, run, selfId }) {
  const blank = { name: '', contact_email: '', company_ids: [] };
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  // The credentials the server just generated. Shown once, here, and never retrievable.
  const [created, setCreated] = useState(null);
  const [pendingSessionRevoke, setPendingSessionRevoke] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleCompany = (id) =>
    setForm((f) => ({
      ...f,
      company_ids: f.company_ids.includes(id)
        ? f.company_ids.filter((x) => x !== id)
        : [...f.company_ids, id],
    }));

  const create = async (e) => {
    e.preventDefault();
    // Not through `run`: that helper discards the response, and this response contains the
    // only copy of the generated password there will ever be.
    let result = null;
    await run(async () => {
      const res = await superAdminApi.post('/superadmin/admins', form);
      result = res.data;
    });
    if (result) {
      setCreated(result);
      setForm(blank);
      setShowForm(false);
    }
  };

  const grant = (adminId, companyId) => {
    if (!companyId) return;
    run(
      () =>
        superAdminApi.post(`/superadmin/admins/${adminId}/companies`, {
          company_id: Number(companyId),
        }),
      'Access granted.'
    );
  };

  const revoke = (adminId, company) =>
    run(
      () => superAdminApi.delete(`/superadmin/admins/${adminId}/companies/${company.company_id}`),
      `Revoked ${company.company_name}.`
    );

  const revokeSessions = async () => {
    const admin = pendingSessionRevoke;
    await run(
      () => superAdminApi.post(`/superadmin/admins/${admin.id}/revoke-sessions`),
      'Sessions revoked.'
    );
    setPendingSessionRevoke(null);
  };

  return (
    <div className="space-y-4">
      <ConfirmAction
        open={Boolean(pendingSessionRevoke)}
        title="End every session"
        message={
          `${pendingSessionRevoke?.email || ''} will be signed out on every device immediately ` +
          'and will have to sign in again. Their account and company access are unchanged — ' +
          'this only ends the sessions that are already open.'
        }
        confirmLabel="End all sessions"
        busy={busy}
        onConfirm={revokeSessions}
        onCancel={() => setPendingSessionRevoke(null)}
      />

      {created && (
        <SecretPanel
          title={`Credentials for ${created.login_email}`}
          description={`Emailed to ${created.emailed_to}. Shown here once in case it does not arrive — there is no way to retrieve this password later, only to create the account again.`}
          values={[created.login_email, created.password]}
          onDone={() => setCreated(null)}
        />
      )}

      <div className="flex justify-end">
        <Button variant={showForm ? 'outline' : 'default'} onClick={() => setShowForm((s) => !s)}>
          <UserPlus className="size-4" />
          {showForm ? 'Cancel' : 'New administrator'}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={create} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="admin-name">Name</Label>
              <Input id="admin-name" value={form.name} onChange={set('name')} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-contact">Their real email address</Label>
              <Input
                id="admin-contact"
                type="email"
                value={form.contact_email}
                onChange={set('contact_email')}
                placeholder="person@example.com"
                required
              />
              <p className="text-xs text-muted-foreground">
                Where the credentials are sent. Their login address is generated and is not
                a mailbox.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Companies</Label>
            {companies.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active companies yet. You can create the administrator now and grant
                access afterwards — until then they will see an empty Admin Hub.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {companies.map((c) => {
                  const on = form.company_ids.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCompany(c.id)}
                      className={
                        on
                          ? 'rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                          : 'rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground'
                      }
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            The login address and password are both generated. The password is emailed to
            them and shown to you once, and it stops working as soon as they set their own.
          </p>

          <Button type="submit" disabled={busy || !form.name.trim() || !form.contact_email.trim()}>
            Create administrator
          </Button>
        </form>
      )}

      <AdminTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Administrator</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Companies</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((a) => {
              const isSuper = a.role === 'super_admin';
              const held = a.companies || [];
              const grantable = companies.filter(
                (c) => !held.some((h) => h.company_id === c.id)
              );
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-semibold text-foreground">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                    {a.contact_email && (
                      <div className="text-xs text-muted-foreground">
                        contact: {a.contact_email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isSuper ? 'default' : 'secondary'}>
                      {isSuper ? 'Super admin' : 'Admin'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isSuper ? (
                      <span className="text-xs text-muted-foreground">
                        Every company, always
                      </span>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {held.length === 0 && (
                            <span className="text-xs text-muted-foreground">
                              None — this admin sees nothing
                            </span>
                          )}
                          {held.map((h) => (
                            <span
                              key={h.id}
                              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs"
                            >
                              {h.company_name}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => revoke(a.id, h)}
                                aria-label={`Revoke ${h.company_name}`}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <UserMinus className="size-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        {grantable.length > 0 && (
                          <NativeSelect
                            className="h-8 text-xs"
                            value=""
                            disabled={busy}
                            onChange={(e) => grant(a.id, e.target.value)}
                            aria-label={`Grant a company to ${a.name}`}
                          >
                            <option value="">Grant a company…</option>
                            {grantable.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </NativeSelect>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {a.id !== selfId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setPendingSessionRevoke(a)}
                      >
                        <KeyRound className="size-3.5" />
                        End sessions
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </AdminTableCard>

      <p className="text-xs text-muted-foreground">
        Revoking a company takes effect on the admin&apos;s very next request — access is
        read fresh every time, not carried in their session. &ldquo;End sessions&rdquo; is
        the stronger action: it signs them out everywhere immediately.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ Unassigned */

function UnassignedTab({ users, companies, busy, run }) {
  const [selected, setSelected] = useState([]);
  const [companyId, setCompanyId] = useState('');

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const allSelected = users.length > 0 && selected.length === users.length;
  const toggleAll = () => setSelected(allSelected ? [] : users.map((u) => u.id));

  const assign = () =>
    run(
      () =>
        superAdminApi.post('/superadmin/users/bulk-assign-company', {
          user_ids: selected,
          company_id: Number(companyId),
        }),
      `Moved ${selected.length} candidate(s).`
    ).then(() => {
      setSelected([]);
      setCompanyId('');
    });

  if (users.length === 0) {
    return (
      <AdminTableCard>
        <AdminEmpty
          icon={Inbox}
          title="Nothing unassigned"
          message="Every candidate belongs to a company. New signups will appear here if they arrive without one."
        />
      </AdminTableCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          These accounts predate company scoping, so nobody but you can see them. Assign
          them and they appear in that company&apos;s Admin Hub.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <NativeSelect
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="sm:w-64"
            aria-label="Company to assign to"
          >
            <option value="">Choose a company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <Button disabled={busy || !companyId || selected.length === 0} onClick={assign}>
            Assign {selected.length || ''} selected
          </Button>
        </div>
      </div>

      <AdminTableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select every unassigned candidate"
                />
              </TableHead>
              <TableHead>Candidate</TableHead>
              <TableHead>CNIC</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.includes(u.id)}
                    onChange={() => toggle(u.id)}
                    aria-label={`Select ${u.name}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-semibold text-foreground">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </TableCell>
                <TableCell className="text-xs">{u.cnic || '—'}</TableCell>
                <TableCell className="text-xs">{u.course_category || '—'}</TableCell>
                <TableCell className="text-xs">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminTableCard>
    </div>
  );
}

export default SuperAdminPortal;
