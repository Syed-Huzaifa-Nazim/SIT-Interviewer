/**
 * The platform-wide audit trail.
 *
 * This is the only view that spans every company — the Admin Hub's own log shows each
 * admin only their own actions, because an entry's `details` names candidates in free text
 * and one admin's entries can carry another company's data. So if this page is wrong there
 * is nobody left who can answer "who touched this candidate", which is the only question
 * an audit trail exists for.
 *
 * Two behaviours here are worth pinning because getting them wrong produces a confident,
 * plausible, empty answer rather than an error:
 *
 *   - Applying a filter must reset to the first page. Staying on page 4 of the previous
 *     result set shows an empty table that reads as "no matches".
 *   - An entry made by an API key must say so. Attributing it only to the key's creator
 *     names a person who may have been asleep at the time.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const get = vi.fn();

vi.mock('../../services/superAdminApi', () => ({
  default: { get: (...args) => get(...args) },
}));

import AuditTab from './AuditTab';

const ADMINS = [
  { id: 1, name: 'Administrator', email: 'admin@interviewer.com' },
  { id: 2, name: 'Rabia Iqbal', email: 'rabia@interviewer.com' },
];

const ROWS = [
  {
    id: 10, admin_id: 2, action: 'SEND_INTERVIEW_INVITE', actor_role: 'admin',
    api_key_id: null, details: 'Issued credentials to User ID 7',
    created_at: new Date().toISOString(),
    actor_name: 'Rabia Iqbal', actor_email: 'rabia@interviewer.com',
    api_key_name: null, api_key_prefix: null,
  },
  {
    id: 11, admin_id: 1, action: 'API_CANDIDATE_UPDATED', actor_role: 'api_key',
    api_key_id: 3, details: 'API key sit_abc updated user 9',
    created_at: new Date().toISOString(),
    actor_name: 'Administrator', actor_email: 'admin@interviewer.com',
    api_key_name: 'Zapier integration', api_key_prefix: 'sit_abcdefghijkl',
  },
];

const onError = vi.fn();

function envelope(data, total = data.length, offset = 0) {
  return { data, pagination: { total, limit: 50, offset, has_more: offset + data.length < total } };
}

beforeEach(() => {
  get.mockReset();
  onError.mockReset();
  get.mockImplementation((url) => {
    if (url.endsWith('/actions')) {
      return Promise.resolve({ data: ['SEND_INTERVIEW_INVITE', 'API_CANDIDATE_UPDATED'] });
    }
    return Promise.resolve({ data: envelope(ROWS) });
  });
});

const renderTab = () => render(<AuditTab admins={ADMINS} onError={onError} />);

describe('the log', () => {
  it('renders entries across every company', async () => {
    renderTab();
    expect(await screen.findByText('Issued credentials to User ID 7')).toBeInTheDocument();
    // Scoped to the table: the action name also appears as an <option> in the filter.
    expect(
      within(screen.getByRole('table')).getByText('SEND_INTERVIEW_INVITE')
    ).toBeInTheDocument();
  });

  it('names the API key when one acted, not just its creator', async () => {
    // The key's creator may have been asleep. Attributing the action to them alone would
    // be an audit trail that says the wrong thing rather than nothing.
    renderTab();
    expect(await screen.findByText(/Zapier integration/)).toBeInTheDocument();
    expect(screen.getByText(/sit_abcdefghijkl/)).toBeInTheDocument();
  });

  it('shows what role the actor held at the time', async () => {
    // Read from the stored actor_role, not from the account's role today: somebody
    // promoted afterwards must not appear to have acted as a super admin.
    renderTab();
    expect(await screen.findByText('api key')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('says the log is empty rather than showing a bare table', async () => {
    get.mockImplementation((url) =>
      url.endsWith('/actions')
        ? Promise.resolve({ data: [] })
        : Promise.resolve({ data: envelope([]) })
    );
    renderTab();
    expect(await screen.findByText('The audit log is empty')).toBeInTheDocument();
  });
});

describe('filtering', () => {
  it('sends the chosen filters', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Issued credentials to User ID 7');

    await user.selectOptions(screen.getByLabelText('Who'), '2');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/superadmin/audit-log', {
        params: { limit: 50, offset: 0, admin_id: '2' },
      })
    );
  });

  it('searches the details text', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Issued credentials to User ID 7');

    await user.type(screen.getByLabelText('Search details'), 'rabia@');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/superadmin/audit-log', {
        params: { limit: 50, offset: 0, search: 'rabia@' },
      })
    );
  });

  it('does not fire a request on every keystroke', async () => {
    // This table can be large; a request per character would hammer it for no benefit.
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Issued credentials to User ID 7');
    const before = get.mock.calls.length;

    await user.type(screen.getByLabelText('Search details'), 'something');

    expect(get.mock.calls.length).toBe(before);
  });

  it('returns to the first page when a filter is applied', async () => {
    const user = userEvent.setup();
    get.mockImplementation((url) =>
      url.endsWith('/actions')
        ? Promise.resolve({ data: [] })
        : Promise.resolve({ data: envelope(ROWS, 500) })
    );
    renderTab();
    await screen.findByText('Issued credentials to User ID 7');

    await user.click(screen.getByRole('button', { name: /Older/ }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/superadmin/audit-log', {
        params: { limit: 50, offset: 50 },
      })
    );

    await user.selectOptions(screen.getByLabelText('Acting as'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // Staying on page 2 of the old result set would show an empty table, which reads as
    // "no matches" rather than "wrong page".
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/superadmin/audit-log', {
        params: { limit: 50, offset: 0, actor_role: 'admin' },
      })
    );
  });

  it('distinguishes "no matches" from "nothing recorded"', async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Issued credentials to User ID 7');

    get.mockImplementation((url) =>
      url.endsWith('/actions')
        ? Promise.resolve({ data: [] })
        : Promise.resolve({ data: envelope([]) })
    );
    await user.type(screen.getByLabelText('Search details'), 'nothing matches this');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // An empty filtered result needs a way back; an empty unfiltered one does not.
    expect(await screen.findByText('Nothing matches those filters')).toBeInTheDocument();
  });
});

describe('paging', () => {
  it('offers no paging when everything fits on one page', async () => {
    renderTab();
    await screen.findByText('Issued credentials to User ID 7');
    expect(screen.queryByRole('button', { name: /Older/ })).not.toBeInTheDocument();
  });

  it('pages backwards and forwards through a large log', async () => {
    const user = userEvent.setup();
    get.mockImplementation((url) =>
      url.endsWith('/actions')
        ? Promise.resolve({ data: [] })
        : Promise.resolve({ data: envelope(ROWS, 500) })
    );
    renderTab();
    await screen.findByText('Issued credentials to User ID 7');

    await user.click(screen.getByRole('button', { name: /Older/ }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/superadmin/audit-log', {
        params: { limit: 50, offset: 50 },
      })
    );

    await user.click(screen.getByRole('button', { name: /Newer/ }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/superadmin/audit-log', {
        params: { limit: 50, offset: 0 },
      })
    );
  });
});
