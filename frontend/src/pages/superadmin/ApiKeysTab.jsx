import React, { useState, useEffect } from 'react';
import { KeySquare, Plus, Ban } from 'lucide-react';

import Alert from '../../components/ui/Alert';
import SecretPanel from './SecretPanel';
import ConfirmAction from './ConfirmAction';
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
 * API keys for /api/v1.
 *
 * A key ends up living in somebody else's configuration for months with nobody watching it,
 * which is why this screen leads with the things that matter later rather than at creation:
 * what each key can reach, whether anything is still calling with it, and how to switch it
 * off. The secret itself is visible for about thirty seconds of its life.
 */

const STATUS_VARIANT = {
  active: 'default',
  revoked: 'destructive',
  expired: 'secondary',
};

const ApiKeysTab = ({ companies, busy, setBusy, onError }) => {
  const [keys, setKeys] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState(null);
  const [pendingRevoke, setPendingRevoke] = useState(null);

  const blank = {
    name: '',
    company_id: '',
    scopes: [],
    rate_limit_per_minute: 60,
    expires_in_days: '',
  };
  const [form, setForm] = useState(blank);

  const load = async () => {
    try {
      const [k, s] = await Promise.all([
        superAdminApi.get('/superadmin/api-keys'),
        superAdminApi.get('/superadmin/api-scopes'),
      ]);
      setKeys(k.data);
      setScopes(s.data);
    } catch (err) {
      onError(err.response?.data?.message || 'Could not load API keys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const toggleScope = (scope) =>
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope)
        ? f.scopes.filter((s) => s !== scope)
        : [...f.scopes, scope],
    }));

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    onError('');
    try {
      const res = await superAdminApi.post('/superadmin/api-keys', {
        ...form,
        company_id: Number(form.company_id),
        rate_limit_per_minute: Number(form.rate_limit_per_minute),
        expires_in_days: form.expires_in_days ? Number(form.expires_in_days) : null,
      });
      setCreated(res.data);
      setForm(blank);
      setShowForm(false);
      await load();
    } catch (err) {
      onError(err.response?.data?.message || 'Could not create the key.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    const key = pendingRevoke;
    setBusy(true);
    onError('');
    try {
      await superAdminApi.post(`/superadmin/api-keys/${key.id}/revoke`);
      setPendingRevoke(null);
      await load();
    } catch (err) {
      onError(err.response?.data?.message || 'Could not revoke the key.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  const canSubmit = form.name.trim() && form.company_id;

  return (
    <div className="space-y-4">
      <ConfirmAction
        open={Boolean(pendingRevoke)}
        title={`Revoke ${pendingRevoke?.name || ''}`}
        message="Anything calling with this key stops working on its very next request, and this cannot be undone — a replacement has to be issued and distributed to whoever is using it."
        confirmLabel="Revoke key"
        confirmWord={pendingRevoke?.name}
        busy={busy}
        onConfirm={revoke}
        onCancel={() => setPendingRevoke(null)}
      />

      {created && (
        <SecretPanel
          title={`API key for ${created.api_key.name}`}
          description="Copy it now. Only a hash is stored, so this key can never be shown again — a lost one has to be revoked and replaced."
          values={[created.key]}
          onDone={() => setCreated(null)}
        />
      )}

      <div className="flex justify-end">
        <Button
          variant={showForm ? 'outline' : 'default'}
          onClick={() => setShowForm((s) => !s)}
          disabled={companies.length === 0}
        >
          <Plus className="size-4" />
          {showForm ? 'Cancel' : 'New API key'}
        </Button>
      </div>

      {companies.length === 0 && (
        <Alert variant="warning">
          A key is bound to one company, so there has to be a company first. Create one on
          the Companies tab.
        </Alert>
      )}

      {showForm && (
        <form onSubmit={create} className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={form.name}
                onChange={set('name')}
                placeholder="Zapier integration"
                required
              />
              <p className="text-xs text-muted-foreground">
                What the audit log shows. A key id tells whoever reads it nothing.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="key-company">Company</Label>
              <NativeSelect
                id="key-company"
                value={form.company_id}
                onChange={set('company_id')}
                required
              >
                <option value="">Choose a company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                Fixed for the life of the key. Two companies means two keys.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="key-rate">Requests per minute</Label>
              <Input
                id="key-rate"
                type="number"
                min="1"
                max="6000"
                value={form.rate_limit_per_minute}
                onChange={set('rate_limit_per_minute')}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="key-expiry">Expires after (days)</Label>
              <Input
                id="key-expiry"
                type="number"
                min="1"
                value={form.expires_in_days}
                onChange={set('expires_in_days')}
                placeholder="Never"
              />
              <p className="text-xs text-muted-foreground">
                An integration meant to be temporary with no expiry is one nobody remembers
                to turn off.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Permissions</Label>
            <p className="text-xs text-muted-foreground">
              A key with none of these can authenticate and do nothing, which is the right
              place to start from.
            </p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {scopes.map((s) => {
                const on = form.scopes.includes(s.scope);
                return (
                  <button
                    key={s.scope}
                    type="button"
                    onClick={() => toggleScope(s.scope)}
                    className={
                      on
                        ? 'rounded-lg border border-primary bg-primary/10 px-3 py-2 text-left'
                        : 'rounded-lg border border-border px-3 py-2 text-left hover:border-ring/40'
                    }
                  >
                    <code className="text-xs font-semibold text-foreground">{s.scope}</code>
                    <span className="block text-xs text-muted-foreground">{s.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button type="submit" disabled={busy || !canSubmit}>
            Create key
          </Button>
        </form>
      )}

      <AdminTableCard>
        {keys.length === 0 ? (
          <AdminEmpty
            icon={KeySquare}
            title="No API keys"
            message="Keys let an integration read this platform's data over /api/v1 without a human signing in."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell>
                    <div className="font-semibold text-foreground">{k.name}</div>
                    <code className="text-xs text-muted-foreground">{k.key_prefix}…</code>
                  </TableCell>
                  <TableCell className="text-xs">{k.company_name || '—'}</TableCell>
                  <TableCell>
                    {k.scopes.length === 0 ? (
                      <span className="text-xs text-muted-foreground">None — can do nothing</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <code
                            key={s}
                            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {s}
                          </code>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {/* The only question that matters when deciding whether a key is still
                        needed: is anything still calling with it? */}
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[k.status] || 'secondary'}>{k.status}</Badge>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {k.rate_limit_per_minute}/min
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {k.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setPendingRevoke(k)}
                      >
                        <Ban className="size-3.5" />
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AdminTableCard>

      <p className="text-xs text-muted-foreground">
        Revoked and expired keys stay listed on purpose. The audit trail refers to them, and
        a key that vanishes is one nobody can look up when an old entry names it.
      </p>
    </div>
  );
};

export default ApiKeysTab;
