/**
 * Mounts the REAL App at /admin the way a browser does, to answer one question directly:
 * can someone reach the Admin Portal by typing the URL, with no login?
 *
 * The other admin tests mount pages in isolation, which cannot see a routing mistake —
 * the guard lives in App.jsx, above every page. This file drives the actual route table
 * with an empty localStorage, exactly like a stranger pasting the URL.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// PwaUpdatePrompt imports a Vite virtual module that only exists in a real build;
// vitest.config.js aliases it to a stub, since vi.mock runs too late to help.

// Any call here would be a bug in itself: with no token there is nothing to fetch.
const apiGet = vi.fn(() => Promise.resolve({ data: {} }));
vi.mock('./services/api', () => ({
  default: {
    get: (...args) => apiGet(...args),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    defaults: { baseURL: 'http://test.local/api' },
  },
  onSlowRequestChange: () => () => {},
}));

import App from './App';

const goTo = (path) => window.history.pushState({}, '', path);

const ADMIN_ROUTES = ['/admin', '/admin/users', '/admin/interviews', '/admin/logs', '/admin/scoring', '/admin/anything-else'];

describe('admin routes are unreachable without a session', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it.each(ADMIN_ROUTES)('%s redirects a signed-out visitor to the login page', async (path) => {
    goTo(path);
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(await screen.findByText('Welcome Back')).toBeInTheDocument();
  });

  it('renders no admin chrome for a signed-out visitor', async () => {
    goTo('/admin');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    // The sidebar entries that exist only inside the portal shell.
    expect(screen.queryByText('Manage Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument();
  });

  it('never calls an admin endpoint for a signed-out visitor', async () => {
    goTo('/admin/users');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    const adminCalls = apiGet.mock.calls.filter(([url]) => String(url).startsWith('/admin'));
    expect(adminCalls).toEqual([]);
  });

  it('sends a signed-in NON-admin to the dashboard, not into the portal', async () => {
    // A real token in storage, but the profile comes back as a candidate. This is the case
    // a token check alone would wave through — the guard has to look at the role.
    localStorage.setItem('access_token', 'a.valid.looking.token');
    apiGet.mockImplementation((url) => {
      if (url === '/users/profile') {
        return Promise.resolve({ data: { user: { id: 5, name: 'Candidate', role: 'candidate' }, tokens: {} } });
      }
      return Promise.resolve({ data: [] });
    });

    goTo('/admin');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  });
});
