/**
 * The API keys screen.
 *
 * A key is handed to an integration and then lives in somebody else's configuration for
 * months with nobody watching it. That makes this screen mostly about the things that
 * matter later rather than at creation, and those are what is pinned here:
 *
 *   - The secret is shown exactly once. If the panel were to auto-dismiss, or the value
 *     never rendered, the key would be unrecoverable and the only fix is to revoke and
 *     re-issue — after whoever needed it has already been told it was sent.
 *   - A key with no scopes must SAY it can do nothing. Rendering that as blank reads as
 *     "still loading" or, far worse, as "unrestricted".
 *   - Revoking asks first, because it breaks a live integration on its next request and
 *     cannot be undone.
 *   - Revoked and expired keys stay in the list, because the audit trail names them.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const get = vi.fn();
const post = vi.fn();

vi.mock('../../services/superAdminApi', () => ({
  default: {
    get: (...args) => get(...args),
    post: (...args) => post(...args),
  },
}));

import ApiKeysTab from './ApiKeysTab';

const COMPANIES = [
  { id: 1, name: 'Acme Corporation', status: 'active' },
  { id: 2, name: 'Initech', status: 'active' },
];

const SCOPES = [
  { scope: 'candidates:read', description: 'Read candidate records' },
  { scope: 'interviews:read', description: 'Read interviews and reports' },
  { scope: 'recordings:read', description: 'Get playback links for session recordings' },
];

const KEYS = [
  {
    id: 1, name: 'Zapier integration', key_prefix: 'sit_abcdefghijkl',
    company_id: 1, company_name: 'Acme Corporation',
    scopes: ['candidates:read'], rate_limit_per_minute: 60, status: 'active',
    last_used_at: new Date().toISOString(), created_at: new Date().toISOString(),
    expires_at: null, revoked_at: null,
  },
  {
    id: 2, name: 'Old dashboard', key_prefix: 'sit_mnopqrstuvwx',
    company_id: 1, company_name: 'Acme Corporation',
    scopes: [], rate_limit_per_minute: 60, status: 'revoked',
    last_used_at: null, created_at: new Date().toISOString(),
    expires_at: null, revoked_at: new Date().toISOString(),
  },
];

const setBusy = vi.fn();
const onError = vi.fn();

function renderTab(companies = COMPANIES) {
  return render(
    <ApiKeysTab companies={companies} busy={false} setBusy={setBusy} onError={onError} />
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  setBusy.mockReset();
  onError.mockReset();
  get.mockImplementation((url) =>
    Promise.resolve({ data: url.endsWith('/api-scopes') ? SCOPES : KEYS })
  );
  post.mockResolvedValue({
    data: {
      api_key: { ...KEYS[0], name: 'New key' },
      key: 'sit_thisisthewholesecretvalue',
    },
  });
});

describe('the key list', () => {
  it('renders each key by name and prefix', async () => {
    renderTab();
    expect(await screen.findByText('Zapier integration')).toBeInTheDocument();
    // The prefix is what tells two keys apart when deciding which to revoke.
    expect(screen.getByText(/sit_abcdefghijkl/)).toBeInTheDocument();
  });

  it('says plainly when a key has no permissions', async () => {
    renderTab();
    expect(await screen.findByText(/None — can do nothing/)).toBeInTheDocument();
  });

  it('keeps revoked keys listed rather than hiding them', async () => {
    // The audit trail refers to them; a key that vanishes is one nobody can look up.
    renderTab();
    expect(await screen.findByText('Old dashboard')).toBeInTheDocument();
    expect(screen.getByText('revoked')).toBeInTheDocument();
  });

  it('shows whether anything is still calling with each key', async () => {
    renderTab();
    expect(await screen.findByText('Never')).toBeInTheDocument();
  });

  it('offers no revoke button for an already-revoked key', async () => {
    renderTab();
    await screen.findByText('Zapier integration');
    expect(screen.getAllByRole('button', { name: /Revoke/ })).toHaveLength(1);
  });

  it('renders an empty state rather than a bare table', async () => {
    get.mockImplementation((url) =>
      Promise.resolve({ data: url.endsWith('/api-scopes') ? SCOPES : [] })
    );
    renderTab();
    expect(await screen.findByText('No API keys')).toBeInTheDocument();
  });
});

describe('creating a key', () => {
  it('cannot be started with no company to bind to', async () => {
    renderTab([]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /New API key/ })).toBeDisabled()
    );
    expect(screen.getByText(/there has to be a company first/i)).toBeInTheDocument();
  });

  it('sends the chosen company, scopes and limits', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Zapier integration');

    await user.click(screen.getByRole('button', { name: /New API key/ }));
    await user.type(screen.getByLabelText('Name'), 'Reporting bot');
    await user.selectOptions(screen.getByLabelText('Company'), '1');
    await user.click(screen.getByRole('button', { name: /candidates:read/ }));
    await user.click(screen.getByRole('button', { name: /Create key/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/superadmin/api-keys', {
        name: 'Reporting bot',
        company_id: 1,
        scopes: ['candidates:read'],
        rate_limit_per_minute: 60,
        expires_in_days: null,
      })
    );
  });

  it('shows the secret once it is created', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Zapier integration');

    await user.click(screen.getByRole('button', { name: /New API key/ }));
    await user.type(screen.getByLabelText('Name'), 'Reporting bot');
    await user.selectOptions(screen.getByLabelText('Company'), '1');
    await user.click(screen.getByRole('button', { name: /Create key/ }));

    // The only time this value will ever be visible.
    expect(await screen.findByText('sit_thisisthewholesecretvalue')).toBeInTheDocument();
    expect(screen.getByText(/can never be shown again/i)).toBeInTheDocument();
  });

  it('will not submit without a name and a company', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Zapier integration');

    await user.click(screen.getByRole('button', { name: /New API key/ }));
    expect(screen.getByRole('button', { name: /Create key/ })).toBeDisabled();

    await user.type(screen.getByLabelText('Name'), 'Reporting bot');
    // Still no company chosen.
    expect(screen.getByRole('button', { name: /Create key/ })).toBeDisabled();
  });

  it('starts with no permissions ticked', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Zapier integration');
    await user.click(screen.getByRole('button', { name: /New API key/ }));
    await user.type(screen.getByLabelText('Name'), 'Reporting bot');
    await user.selectOptions(screen.getByLabelText('Company'), '1');
    await user.click(screen.getByRole('button', { name: /Create key/ }));

    // A key that can do nothing is the right thing to default to.
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/superadmin/api-keys',
        expect.objectContaining({ scopes: [] })
      )
    );
  });
});

describe('revoking', () => {
  /* Confirmation is an in-page modal, never window.confirm(). A native confirm blocks the
     tab's main thread while it is open, and the reading time is attributed to the click
     that opened it — the Admin Hub's DeleteButton documents measuring exactly that as a
     2+ second "slow" interaction. */

  it('does not use a native confirm dialog', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderTab();
    await screen.findByText('Zapier integration');

    await user.click(screen.getByRole('button', { name: /Revoke/ }));

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('asks before breaking a live integration', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Zapier integration');

    await user.click(screen.getByRole('button', { name: /Revoke/ }));

    expect(await screen.findByText(/stops working on its very next request/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('requires the key name to be typed before it will revoke', async () => {
    // The damage lands on somebody who is not in the room — the person clicking is not the
    // person whose integration breaks. A one-click confirm is muscle memory; typing is not.
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Zapier integration');

    await user.click(screen.getByRole('button', { name: /Revoke/ }));
    expect(await screen.findByRole('button', { name: 'Revoke key' })).toBeDisabled();

    await user.type(screen.getByLabelText(/Type/), 'Zapier integration');
    expect(screen.getByRole('button', { name: 'Revoke key' })).toBeEnabled();
  });

  it('revokes once the name matches', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Zapier integration');

    await user.click(screen.getByRole('button', { name: /Revoke/ }));
    await user.type(await screen.findByLabelText(/Type/), 'Zapier integration');
    await user.click(screen.getByRole('button', { name: 'Revoke key' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/superadmin/api-keys/1/revoke')
    );
  });

  it('cancelling revokes nothing', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Zapier integration');

    await user.click(screen.getByRole('button', { name: /Revoke/ }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(post).not.toHaveBeenCalled();
  });
});
