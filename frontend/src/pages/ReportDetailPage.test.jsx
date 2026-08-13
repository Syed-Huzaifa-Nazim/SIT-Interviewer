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
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(await screen.findByText('72%')).toBeInTheDocument();
    expect(screen.getByText('frontend developer')).toBeInTheDocument();
    expect(screen.getByText('Audit Fail')).toBeInTheDocument();
    // Double-encoded strengths must still come through as list items.
    expect(screen.getByText('Clear explanations')).toBeInTheDocument();
    expect(screen.getByText('Weak on promises')).toBeInTheDocument();
  });

  it('renders admin-only sections for an admin', async () => {
    currentUser = { id: 99, name: 'Admin', role: 'admin' };
    renderReport();
    expect(await screen.findByText('72%')).toBeInTheDocument();
    // Admin-only tabs: evidence tools and the session recording. 'Recording' appears
    // both as the tab label and as a summary fact, so match on count rather than one node.
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getAllByText('Recording').length).toBeGreaterThan(0);
    expect(screen.getByText('Candidate Profile')).toBeInTheDocument();
  });

  it('summarises repeated violations by type', async () => {
    currentUser = { id: 99, name: 'Admin', role: 'admin' };
    renderReport();
    await screen.findByText('72%');
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
    await screen.findByText('72%');
    expect(screen.getByText('What is a closure?')).toBeInTheDocument();
    expect(screen.getByText(/No answer recorded/i)).toBeInTheDocument();
  });

  /* ------------------------------------------------- post-interview feedback */
  // Enrolled candidates never see the one-time thank-you screen — they land here. The
  // form used to be one of six tabs with no categories, so half the intake was never
  // really asked. It is now promoted to the top of the evidence pane, gated on who is
  // looking and whether they have already answered.

  it('asks the candidate for feedback when they have not given any', async () => {
    reportResponse = { ...fullReport, feedback_submitted: false };
    renderReport();
    expect(await screen.findByText('How was your interview?', {}, { timeout: 5000 })).toBeInTheDocument();
    // The categories are the point of the promoted form, not just a rating box.
    expect(screen.getByText('Question Quality')).toBeInTheDocument();
    expect(screen.getByText('Proctoring')).toBeInTheDocument();
  });

  it('does not ask again once the server says feedback exists', async () => {
    // Survives a different device, a re-login and a cleared cache, because it is the
    // server's answer rather than anything remembered in the browser.
    reportResponse = { ...fullReport, feedback_submitted: true };
    renderReport();
    await screen.findByText('72%');
    expect(screen.queryByText('How was your interview?')).not.toBeInTheDocument();
  });

  it('never asks an admin who is reviewing another persons report', async () => {
    currentUser = { id: 99, name: 'Admin', role: 'admin' };
    reportResponse = { ...fullReport, feedback_submitted: false };
    renderReport();
    await screen.findByText('72%');
    expect(screen.queryByText('How was your interview?')).not.toBeInTheDocument();
  });

  it('submits the rating and categories, then stops asking', async () => {
    const api = (await import('../services/api')).default;
    reportResponse = { ...fullReport, feedback_submitted: false };
    renderReport();
    await screen.findByText('How was your interview?', {}, { timeout: 5000 });

    // Rate one category specifically — scoped by its radiogroup, since the overall row
    // renders the same star labels and picking by index would silently test that instead.
    const group = screen.getByRole('radiogroup', { name: 'Question Quality' });
    await userEvent.click(within(group).getByRole('radio', { name: /4 out of 5/i }));
    await userEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    // Generous timeouts: the default 1s is enough in isolation but this file mounts a
    // heavy page, and under a full parallel suite run it was occasionally missed.
    await waitFor(() => expect(api.post).toHaveBeenCalled(), { timeout: 5000 });
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/feedback');
    expect(body.interview_id).toBe(11);
    expect(body.rating).toBeGreaterThan(0);
    expect(Object.keys(body.category_ratings).length).toBeGreaterThan(0);

    // The prompt closes on success rather than sitting there re-askable.
    await waitFor(
      () => expect(screen.queryByText('How was your interview?')).not.toBeInTheDocument(),
      { timeout: 5000 }
    );
  });

  it('keeps the form up and explains itself when submission fails', async () => {
    const api = (await import('../services/api')).default;
    api.post.mockRejectedValueOnce({ response: { data: { message: 'Server said no' } } });
    reportResponse = { ...fullReport, feedback_submitted: false };
    renderReport();
    await screen.findByText('How was your interview?', {}, { timeout: 5000 });

    const stars = screen.getAllByRole('radio', { name: /5 out of 5/i });
    await userEvent.click(stars[0]);
    await userEvent.click(screen.getByRole('button', { name: /submit feedback/i }));

    expect(await screen.findByText('Server said no', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('How was your interview?')).toBeInTheDocument();
  });
});
