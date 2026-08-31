/**
 * The management portal, mounted against a stubbed API.
 *
 * This page hands out access to candidate data — it creates admins and moves candidates
 * between companies — and almost nobody opens it, so a render crash or a mislabelled
 * button here would go unnoticed for a long time and then surface at the worst moment.
 *
 * Beyond "it renders", two behaviours are worth pinning because getting them wrong is
 * silent rather than loud:
 *
 *   1. The portal must use its OWN session key. Sharing `access_token` with the Admin Hub
 *      would make the two sessions overwrite each other, and a sign-out here would sign
 *      the person out of the Hub in another tab.
 *   2. An admin holding no companies must be shown as holding none. Rendering that state
 *      as blank reads as "loading" or "everything", and the whole point of the page is
 *      that access is legible at a glance.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ------------------------------------------------------------------ API stub */

const COMPANIES = [
  { id: 1, name: 'Acme Corporation', slug: 'acme-corporation', status: 'active', is_default: true, admin_count: 1, candidate_count: 12, created_at: new Date().toISOString() },
  { id: 2, name: 'Globex', slug: 'globex', status: 'archived', is_default: false, admin_count: 0, candidate_count: 3, created_at: new Date().toISOString() },
];

const ADMINS = [
  {
    id: 1, name: 'Administrator', email: 'admin@interviewer.com', role: 'super_admin',
    contact_email: null, created_at: new Date().toISOString(), companies: [],
  },
  {
    id: 2, name: 'Rabia Iqbal', email: 'rabia@interviewer.com', role: 'admin',
    contact_email: 'rabia@acme.example', created_at: new Date().toISOString(),
    companies: [{ id: 7, admin_user_id: 2, company_id: 1, company_name: 'Acme Corporation' }],
  },
  {
    id: 3, name: 'Bilal Ahmed', email: 'bilal@interviewer.com', role: 'admin',
    contact_email: null, created_at: new Date().toISOString(), companies: [],
  },
];

const UNASSIGNED = [
  { id: 40, name: 'Ali Raza', email: 'ali@example.com', cnic: '42101-1234567-1', course_category: 'AI', created_at: new Date().toISOString() },
  { id: 41, name: 'Sara Khan', email: 'sara@example.com', cnic: '42101-1234567-2', course_category: 'Instructor', created_at: new Date().toISOString() },
];

const responses = {
  '/superadmin/companies': COMPANIES,
  '/superadmin/admins': ADMINS,
  '/superadmin/unassigned-users': UNASSIGNED,
};

let emptyMode = false;

const post = vi.fn(() => Promise.resolve({ data: {} }));
const put = vi.fn(() => Promise.resolve({ data: {} }));
const del = vi.fn(() => Promise.resolve({ data: {} }));

vi.mock('../../services/superAdminApi', async () => {
  const actual = await vi.importActual('../../services/superAdminApi');
  return {
    ...actual,
    default: {
      get: vi.fn((url) => Promise.resolve({ data: emptyMode ? [] : (responses[url] ?? []) })),
      post: (...args) => post(...args),
      put: (...args) => put(...args),
      delete: (...args) => del(...args),
    },
  };
});

// Mocked rather than wrapped in the real ThemeProvider: that provider writes to
// localStorage and mutates <html>, and this file asserts on localStorage contents.
vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), isDark: false }),
  ThemeProvider: ({ children }) => children,
}));

import SuperAdminPortal from './SuperAdminPortal';
import {
  SUPERADMIN_TOKEN_KEY,
  SUPERADMIN_USER_KEY,
  saveSuperAdminSession,
  readSuperAdminSession,
  clearSuperAdminSession,
} from '../../services/superAdminApi';

function renderPortal() {
  return render(
    <MemoryRouter initialEntries={['/superadmin']}>
      <Routes>
        <Route path="/superadmin" element={<SuperAdminPortal />} />
        <Route path="/superadmin/login" element={<div>sign in</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  emptyMode = false;
  post.mockClear();
  put.mockClear();
  del.mockClear();
  localStorage.clear();
  saveSuperAdminSession('a-token', { id: 1, email: 'admin@interviewer.com', role: 'super_admin' });
});

afterEach(() => {
  localStorage.clear();
});

/* ------------------------------------------------------------------ session */

describe('the management session is separate from the Admin Hub session', () => {
  it('is stored under its own key, not access_token', () => {
    expect(localStorage.getItem(SUPERADMIN_TOKEN_KEY)).toBe('a-token');
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('clearing it leaves the Admin Hub session alone', () => {
    localStorage.setItem('access_token', 'hub-token');
    localStorage.setItem('refresh_token', 'hub-refresh');

    clearSuperAdminSession();

    expect(localStorage.getItem(SUPERADMIN_TOKEN_KEY)).toBeNull();
    // The person is very likely signed into the Hub in another tab. Signing them out of it
    // for no reason is the failure this asserts against.
    expect(localStorage.getItem('access_token')).toBe('hub-token');
    expect(localStorage.getItem('refresh_token')).toBe('hub-refresh');
  });

  it('survives a corrupted user blob instead of leaving the portal unopenable', () => {
    localStorage.setItem(SUPERADMIN_USER_KEY, '{not json');
    expect(readSuperAdminSession()).toBeNull();
    expect(localStorage.getItem(SUPERADMIN_TOKEN_KEY)).toBeNull();
  });

  it('redirects to its own sign-in when there is no session', async () => {
    clearSuperAdminSession();
    renderPortal();
    expect(await screen.findByText('sign in')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ rendering */

describe('SuperAdminPortal', () => {
  it('renders the three lists without throwing', async () => {
    renderPortal();
    expect(await screen.findByText('Acme Corporation')).toBeInTheDocument();
    expect(screen.getByText(/Signed in as admin@interviewer.com/)).toBeInTheDocument();
  });

  it('renders with every list empty', async () => {
    emptyMode = true;
    renderPortal();
    expect(await screen.findByText(/No companies yet/i)).toBeInTheDocument();
  });

  it('marks an archived company as archived rather than hiding it', async () => {
    // Archiving is reversible and the row has to stay visible to be restored.
    renderPortal();
    expect(await screen.findByText('Globex')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('shows a super admin as holding every company, not as holding none', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Administrators/ }));

    expect(await screen.findByText(/Every company, always/)).toBeInTheDocument();
  });

  it('says plainly when an admin holds no companies', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Administrators/ }));

    // Bilal holds nothing. Rendering that as blank would read as "loading" or, worse, as
    // "everything" — the one thing this page exists to make unambiguous.
    expect(
      await screen.findByText(/None — this admin sees nothing/)
    ).toBeInTheDocument();
  });

  it('lists unassigned candidates with an explanation of why nobody else sees them', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Unassigned/ }));

    expect(await screen.findByText('Ali Raza')).toBeInTheDocument();
    expect(screen.getByText(/nobody but you can see them/i)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ actions */

describe('actions', () => {
  it('creates a company', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');

    await user.type(screen.getByLabelText('New company'), 'Initech');
    await user.click(screen.getByRole('button', { name: /Create/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/superadmin/companies', { name: 'Initech' })
    );
  });

  it('will not submit an empty company name', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');

    await user.click(screen.getByRole('button', { name: /Create/ }));
    expect(post).not.toHaveBeenCalled();
  });

  it('grants a company to an admin who does not hold it', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Administrators/ }));

    const select = await screen.findByLabelText('Grant a company to Bilal Ahmed');
    await user.selectOptions(select, '1');

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/superadmin/admins/3/companies', { company_id: 1 })
    );
  });

  it('does not offer a company an admin already holds', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Administrators/ }));

    // Rabia already holds Acme, so her only remaining option would be an archived company —
    // which is filtered out too, leaving no picker at all.
    expect(screen.queryByLabelText('Grant a company to Rabia Iqbal')).not.toBeInTheDocument();
  });

  it('revokes a company from an admin', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Administrators/ }));

    await user.click(await screen.findByLabelText('Revoke Acme Corporation'));

    await waitFor(() =>
      expect(del).toHaveBeenCalledWith('/superadmin/admins/2/companies/1')
    );
  });

  it('confirms before ending another admin\'s sessions', async () => {
    /* An in-page modal, never window.confirm(). A native confirm blocks the tab's main
       thread while it is open and the reading time is charged to the click that opened it —
       the Admin Hub's DeleteButton documents measuring exactly that as a 2+ second "slow"
       interaction. */
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Administrators/ }));

    await user.click((await screen.findAllByRole('button', { name: /End sessions/ }))[0]);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText(/signed out on every device immediately/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('ends the sessions once confirmed', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Administrators/ }));

    await user.click((await screen.findAllByRole('button', { name: /End sessions/ }))[0]);
    await user.click(await screen.findByRole('button', { name: 'End all sessions' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/superadmin/admins/2/revoke-sessions')
    );
  });

  it('cancelling ends nothing', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Administrators/ }));

    await user.click((await screen.findAllByRole('button', { name: /End sessions/ }))[0]);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(post).not.toHaveBeenCalled();
  });

  it('bulk-assigns selected candidates to a company', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Unassigned/ }));

    await user.click(await screen.findByLabelText('Select Ali Raza'));
    await user.selectOptions(screen.getByLabelText('Company to assign to'), '1');
    await user.click(screen.getByRole('button', { name: /Assign/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/superadmin/users/bulk-assign-company', {
        user_ids: [40],
        company_id: 1,
      })
    );
  });

  it('only offers active companies to assign into', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByText('Acme Corporation');
    await user.click(screen.getByRole('button', { name: /Unassigned/ }));

    const select = await screen.findByLabelText('Company to assign to');
    // Globex is archived; moving candidates into a retired company is not a thing to offer.
    expect(select).not.toHaveTextContent('Globex');
    expect(select).toHaveTextContent('Acme Corporation');
  });
});

/* ------------------------------------------------------------------ signup destination */

describe('where public signups land', () => {
  it('marks the company that takes them', async () => {
    renderPortal();
    await screen.findByText('Acme Corporation');
    expect(screen.getByText('Signups')).toBeInTheDocument();
  });

  it('does not offer to hand signups to the company already taking them', async () => {
    renderPortal();
    await screen.findByText('Acme Corporation');
    // Acme already has it; only the archived Globex remains, which cannot take signups.
    expect(screen.queryByRole('button', { name: /Take signups/ })).not.toBeInTheDocument();
  });

  it('warns when nothing is taking signups, because the failure is otherwise invisible', async () => {
    // Every new enrolment would silently pile up in Unassigned, where only the super admin
    // looks — the admin who should be inviting them never sees a thing go wrong.
    responses['/superadmin/companies'] = COMPANIES.map((c) => ({ ...c, is_default: false }));
    renderPortal();
    expect(
      await screen.findByText(/No company is taking public signups/i)
    ).toBeInTheDocument();
    responses['/superadmin/companies'] = COMPANIES;
  });

  it('hands signups to another company on request', async () => {
    const user = userEvent.setup();
    responses['/superadmin/companies'] = [
      { ...COMPANIES[0], is_default: false },
      { ...COMPANIES[1], status: 'active', is_default: false },
    ];
    renderPortal();
    await screen.findByText('Acme Corporation');

    await user.click((await screen.findAllByRole('button', { name: /Take signups/ }))[0]);

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith('/superadmin/companies/1', { is_default: true })
    );
    responses['/superadmin/companies'] = COMPANIES;
  });
});
