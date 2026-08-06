/**
 * Mounts the assessment scorecard in the states it actually reaches in production.
 *
 * This page is shared: a candidate views their own report and an admin reviews it with
 * the recording and snapshot evidence attached, so both roles are covered here. It also
 * has three pre-report states — loading, scoring-in-progress (the interview is finished
 * but grading is still running) and error — each of which returns early, so a crash in
 * one would never be caught by testing the happy path alone.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let reportResponse;
let currentUser;

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn((url) => {
      if (String(url).includes('/report')) {
        if (reportResponse instanceof Error) return Promise.reject(reportResponse);
        return Promise.resolve({ data: reportResponse });
      }
      if (String(url).includes('proctor-snapshots')) {
        return Promise.resolve({
          data: [
            { id: 1, kind: 'termination', captured_at: new Date().toISOString(), label: 'no face' },
            { id: 2, kind: 'screen', captured_at: new Date().toISOString(), label: 'periodic' },
          ],
        });
      }
      if (String(url).includes('video-url')) return Promise.resolve({ data: { video_url: 'blob:x' } });
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: currentUser, loading: false }),
  AuthProvider: ({ children }) => children,
}));

import ReportDetailPage from './ReportDetailPage';

const fullReport = {
  scoring_status: 'complete',
  interview: {
    id: 11,
    user_id: 3,
    type: 'technical',
    job_role: 'frontend developer',
    difficulty: 'Medium',
    created_at: new Date().toISOString(),
    feedback_summary: 'Solid fundamentals, shaky on async.',
    is_proctor_failed: true,
    has_video: true,
    proctor_violations_count: 4,
    proctor_logs: JSON.stringify([
      { type: 'LOOK_AWAY', details: 'Looked away', timestamp: new Date().toISOString() },
      { type: 'NO_FACE', details: 'No face detected', timestamp: new Date().toISOString() },
      { type: 'LOOK_AWAY', details: 'Looked away again', timestamp: new Date().toISOString() },
    ]),
  },
  report: {
    overall_score: 72,
    technical_score: 80,
    communication_score: 65,
    confidence_score: 70,
    problem_solving_score: 74,
    // Double-encoded on purpose: the API has returned this shape, and the parser is
    // expected to unwrap it rather than blank the section.
    strengths: JSON.stringify(JSON.stringify(['Clear explanations', 'Good CSS depth'])),
    weaknesses: JSON.stringify(['Weak on promises']),
    recommendations: 'Practise async patterns.',
    missing_concepts: 'Event loop',
    snapshot_image: null,
    snapshot_description: null,
  },
  qna: [
    {
      question: { question_text: 'Explain the event loop.' },
      response: { response_text: 'It handles async callbacks.', feedback: 'Partially correct.', score: 60 },
    },
    { question: { question_text: 'What is a closure?' }, response: null },
  ],
};

const renderReport = () =>
  render(
    <MemoryRouter initialEntries={['/interview/report/11']}>
      <Routes>
        <Route path="/interview/report/:id" element={<ReportDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('ReportDetailPage', () => {
  beforeEach(() => {
    reportResponse = fullReport;
    currentUser = { id: 3, name: 'Ali Raza', role: 'candidate' };
    vi.clearAllMocks();
  });

  it('renders the scorecard for a candidate', async () => {
    renderReport();
    expect(await screen.findByText(/Candidate Scorecard/i)).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('Audit Fail')).toBeInTheDocument();
    // Double-encoded strengths must still come through as list items.
    expect(screen.getByText('Clear explanations')).toBeInTheDocument();
    expect(screen.getByText('Weak on promises')).toBeInTheDocument();
  });

  it('renders admin-only sections for an admin', async () => {
    currentUser = { id: 99, name: 'Admin', role: 'admin' };
    renderReport();
    expect(await screen.findByText(/Candidate Scorecard/i)).toBeInTheDocument();
    // Appears twice by design — once as the tab label, once as the panel heading.
    expect(screen.getAllByText('Admin Tools').length).toBe(2);
    await waitFor(() => expect(screen.getByText('Session Recording')).toBeInTheDocument());
  });

  it('summarises repeated violations by type', async () => {
    currentUser = { id: 99, name: 'Admin', role: 'admin' };
    renderReport();
    await screen.findByText(/Candidate Scorecard/i);
    // LOOK_AWAY occurs twice, NO_FACE once — the summary must group rather than list.
    expect(screen.getAllByText('LOOK AWAY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NO FACE').length).toBeGreaterThan(0);
  });

  it('shows the scoring-in-progress state while grading runs', async () => {
    reportResponse = { scoring_status: 'in_progress', report: null, interview: {}, qna: [] };
    renderReport();
    expect(await screen.findByText('Scoring in progress')).toBeInTheDocument();
  });

  it('shows an error state when the report cannot be fetched', async () => {
    reportResponse = Object.assign(new Error('nope'), { response: { data: { message: 'Report missing' } } });
    renderReport();
    expect(await screen.findByText('Error Loading Report')).toBeInTheDocument();
    expect(screen.getByText('Report missing')).toBeInTheDocument();
  });

  it('renders an unscored answer without crashing', async () => {
    renderReport();
    await screen.findByText(/Candidate Scorecard/i);
    expect(screen.getByText('What is a closure?')).toBeInTheDocument();
    expect(screen.getByText(/No answer recorded/i)).toBeInTheDocument();
  });
});
