/**
 * Mounts each Admin Portal page against a stubbed API.
 *
 * These pages are lazy-loaded and sit behind an admin login, so a render-time crash in
 * one of them would not show up in a build, in the other tests, or in casual clicking
 * around — it would surface as a blank page for whoever opened that section. A
 * `useCallback` missing from an import once blanked a live interview page for exactly
 * this reason, so every admin page gets mounted here with both data and empty-data
 * responses.
 *
 * Assertions stay deliberately shallow: the contract under test is "renders without
 * throwing", not any particular markup, so ordinary redesign work does not churn this file.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/* ------------------------------------------------------------------ API stub */

const apiData = {
  '/admin/stats': {
    users: { total: 42, active: 38, banned: 4 },
    interviews: { completed: 25, active: 3, daily: 5 },
    revenue: { total: 120.5, currency: 'USD' },
    tokens: { total_available: 300, total_consumed: 180 },
    feedbacks: [
      { id: 1, user_name: 'Ali Raza', rating: 4, feedback_text: 'Smooth experience', issues_reported: null, created_at: new Date().toISOString() },
      { id: 2, user_name: 'Sara Khan', rating: 2, feedback_text: 'Mic issues', issues_reported: 'Audio dropped', created_at: new Date().toISOString() },
    ],
    logs: [{ id: 1, action: 'USER_BANNED', details: 'Banned candidate #7', created_at: new Date().toISOString() }],
  },
  '/admin/users': [
    { id: 1, name: 'Ali Raza', email: 'ali@example.com', role: 'candidate', status: 'active', job_role: 'frontend', online: true, tokens_available: 3, latest_interview_id: 11, interview_status: 'interview_completed', cnic: '4210112345671' },
    { id: 2, name: 'Sara Khan', email: 'sara@example.com', role: 'candidate', status: 'banned', job_role: 'backend', online: false, tokens_available: 0, latest_interview_id: null, interview_status: 'not_interviewed', cnic: '4210112345672' },
  ],
  '/admin/interviews': [
    { id: 11, user_id: 1, user_name: 'Ali Raza', user_email: 'ali@example.com', type: 'technical', status: 'completed', overall_score: 82, is_proctor_failed: false, proctor_violations_count: 0, created_at: new Date().toISOString() },
    { id: 12, user_id: 2, user_name: 'Sara Khan', user_email: 'sara@example.com', type: 'technical', status: 'completed', overall_score: 35, is_proctor_failed: true, proctor_violations_count: 4, created_at: new Date(Date.now() - 864e5 * 3).toISOString() },
  ],
  '/admin/transactions': [
    { id: 1, user_name: 'Ali Raza', user_email: 'ali@example.com', amount: 10, transaction_type: 'purchase', tokens: 5, created_at: new Date().toISOString() },
  ],
  '/admin/feedback': [
    { id: 1, user_name: 'Ali Raza', user_email: 'ali@example.com', rating: 5, feedback_text: 'Great', issues_reported: null, created_at: new Date().toISOString() },
  ],
  '/admin/logs': [{ id: 1, action: 'USER_BANNED', details: 'Banned candidate #7', created_at: new Date().toISOString() }],
  '/admin/email-logs': [
    { id: 1, to_email: 'ali@example.com', subject: 'Interview invite', status: 'sent', error: null, created_at: new Date().toISOString() },
    { id: 2, to_email: 'sara@example.com', subject: 'Interview invite', status: 'failed', error: 'SMTP timeout', created_at: new Date().toISOString() },
  ],
  '/admin/recording-logs': [
    { id: 1, user_id: 1, interview_id: 11, status: 'active', storage_path: 'supabase://rec/1.webm', created_at: new Date().toISOString() },
  ],
  '/admin/reinterview-requests': { pending: [], decided: [] },
  '/admin/proctor-snapshots': [],
  '/admin/pending-actions/count': { total: 2 },
  '/admin/scoring/analytics': {
    overview: {
      total_interviews: 2,
      total_evaluations: 8,
      avg_score: 58.5,
      avg_confidence: 61.2,
      flagged_evaluations: 1,
      score_distribution: [
        { range: '0-20', count: 0 },
        { range: '20-40', count: 1 },
        { range: '40-60', count: 0 },
        { range: '60-80', count: 0 },
        { range: '80-100', count: 1 },
      ],
    },
    interviews: [
      { interview_id: 11, candidate_name: 'Ali Raza', job_role: 'frontend', type: 'technical', question_count: 5, avg_score: 82, avg_confidence: 75, flagged_count: 0, overall_score: 82, created_at: new Date().toISOString() },
      { interview_id: 12, candidate_name: 'Sara Khan', job_role: 'backend', type: 'technical', question_count: 5, avg_score: 35, avg_confidence: 47, flagged_count: 1, overall_score: 35, created_at: new Date().toISOString() },
    ],
  },
  '/admin/users/1': { id: 1, name: 'Ali Raza', email: 'ali@example.com', role: 'candidate', status: 'active', job_role: 'frontend', online: true, tokens_available: 3, latest_interview_id: 11, interview_status: 'interview_completed', cnic: '4210112345671' },
};

let emptyMode = false;

const emptyFor = (url) => {
  const shaped = apiData[url];
  if (Array.isArray(shaped)) return [];
  if (shaped && typeof shaped === 'object' && 'pending' in shaped) return { pending: [], decided: [] };
  if (url === '/admin/scoring/analytics') {
    return {
      overview: {
        total_interviews: 0,
        total_evaluations: 0,
        avg_score: 0,
        avg_confidence: 0,
        flagged_evaluations: 0,
        score_distribution: [
          { range: '0-20', count: 0 },
          { range: '20-40', count: 0 },
          { range: '40-60', count: 0 },
          { range: '60-80', count: 0 },
          { range: '80-100', count: 0 },
        ],
      },
      interviews: [],
    };
  }
  if (url === '/admin/stats') {
    return {
      users: { total: 0, active: 0, banned: 0 },
      interviews: { completed: 0, active: 0, daily: 0 },
      revenue: { total: 0, currency: 'USD' },
      tokens: { total_available: 0, total_consumed: 0 },
      feedbacks: [],
      logs: [],
    };
  }
  return shaped ?? {};
};

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn((url) => {
      const path = String(url).split('?')[0];
      const key = Object.keys(apiData).find((k) => path === k) ?? path;
      return Promise.resolve({ data: emptyMode ? emptyFor(key) : (apiData[key] ?? {}) });
    }),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 99, name: 'Admin User', email: 'admin@example.com', role: 'admin' },
    logout: vi.fn(),
    loading: false,
  }),
  AuthProvider: ({ children }) => children,
}));

// Mocked rather than wrapped in the real ThemeProvider: that provider writes to
// localStorage and mutates <html>, which would leak theme state between test files.
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), isDark: false }),
  ThemeProvider: ({ children }) => children,
}));

/* --------------------------------------------------------------- page imports */

import AdminDashboard from './AdminDashboard';
import AdminUsersPage from './AdminUsersPage';
import AdminUserProfilePage from './AdminUserProfilePage';
import AdminInterviewsPage from './AdminInterviewsPage';
import AdminScoringPage from './AdminScoringPage';
import AdminApprovalsPage from './AdminApprovalsPage';
import AdminLogsPage from './AdminLogsPage';
import AdminTransactionsPage from './AdminTransactionsPage';
import AdminFeedbackPage from './AdminFeedbackPage';
import AdminLayout from '../layouts/AdminLayout';

const renderPage = (ui, { route = '/admin', path = '/admin' } = {}) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
      </Routes>
    </MemoryRouter>
  );

const PAGES = [
  ['AdminDashboard', <AdminDashboard />, '/admin', '/admin'],
  ['AdminUsersPage', <AdminUsersPage />, '/admin/users', '/admin/users'],
  ['AdminUserProfilePage', <AdminUserProfilePage />, '/admin/users/1', '/admin/users/:userId'],
  ['AdminInterviewsPage', <AdminInterviewsPage />, '/admin/interviews', '/admin/interviews'],
  ['AdminScoringPage', <AdminScoringPage />, '/admin/scoring', '/admin/scoring'],
  ['AdminApprovalsPage', <AdminApprovalsPage />, '/admin/approvals', '/admin/approvals'],
  ['AdminLogsPage', <AdminLogsPage />, '/admin/logs', '/admin/logs'],
  ['AdminTransactionsPage', <AdminTransactionsPage />, '/admin/transactions', '/admin/transactions'],
  ['AdminFeedbackPage', <AdminFeedbackPage />, '/admin/feedback', '/admin/feedback'],
];

describe('admin portal pages', () => {
  beforeEach(() => {
    emptyMode = false;
    vi.clearAllMocks();
  });
  afterEach(() => {
    emptyMode = false;
  });

  it.each(PAGES)('%s mounts and settles with data', async (name, element, route, path) => {
    const { container } = renderPage(element, { route, path });
    // Wait for the initial fetch to resolve so the loaded branch renders too, not just
    // the loading skeleton — most crashes live in the loaded branch.
    await waitFor(() => expect(container.innerHTML.length).toBeGreaterThan(0));
    await waitFor(() => expect(container.querySelector('*')).toBeTruthy());
  });

  it.each(PAGES)('%s mounts with empty data', async (name, element, route, path) => {
    emptyMode = true;
    const { container } = renderPage(element, { route, path });
    await waitFor(() => expect(container.innerHTML.length).toBeGreaterThan(0));
  });

  // Every searchable list page must expose the filter control next to its search box.
  // Approvals, the candidate profile and the dashboard have no search bar, so no filter.
  it.each([
    ['AdminUsersPage', <AdminUsersPage />, '/admin/users', '/admin/users'],
    ['AdminInterviewsPage', <AdminInterviewsPage />, '/admin/interviews', '/admin/interviews'],
    ['AdminScoringPage', <AdminScoringPage />, '/admin/scoring', '/admin/scoring'],
    ['AdminLogsPage', <AdminLogsPage />, '/admin/logs', '/admin/logs'],
    ['AdminTransactionsPage', <AdminTransactionsPage />, '/admin/transactions', '/admin/transactions'],
    ['AdminFeedbackPage', <AdminFeedbackPage />, '/admin/feedback', '/admin/feedback'],
  ])('%s offers a filter control beside its search', async (name, element, route, path) => {
    renderPage(element, { route, path });
    const filterBtn = await screen.findByRole('button', { name: /^Filters/ });
    expect(filterBtn).toBeInTheDocument();
  });

  it('AdminLayout renders its shell and navigation', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AdminLayout>
          <div>child content</div>
        </AdminLayout>
      </MemoryRouter>
    );
    expect(await screen.findByText('child content')).toBeInTheDocument();
    expect(screen.getAllByText('Manage Users').length).toBeGreaterThan(0);
  });

  it('AdminLayout blocks a non-admin', async () => {
    const authModule = await import('../context/AuthContext');
    vi.spyOn(authModule, 'useAuth').mockReturnValue({
      user: { id: 5, name: 'Candidate', role: 'candidate' },
      logout: vi.fn(),
      loading: false,
    });
    render(
      <MemoryRouter>
        <AdminLayout>
          <div>secret</div>
        </AdminLayout>
      </MemoryRouter>
    );
    expect(screen.getByText('Access Restricted')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });
});
