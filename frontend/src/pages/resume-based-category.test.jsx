/**
 * The Resume-Based Interview category, on the screens an admin and a candidate actually use.
 *
 * Two things here are worth pinning beyond "renders without throwing":
 *
 *   1. Manage Users now has three tabs, and every account must appear in exactly one. The
 *      obvious implementation leaves these candidates in Enrolled Users as well, since they
 *      all self-enrol and so have no bulk_batch_id — double-counting them and defeating the
 *      point of a separate tab.
 *   2. The report's per-question traceability has to distinguish "came from this line of the
 *      resume" from "came from nothing". The second is the finding, and rendering it the
 *      same as an ordinary question would hide the only signal that the generator drifted.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { RESUME_CATEGORY, isResumeCategory, hasCourseStatus } from '../utils/constants';

/* ------------------------------------------------------------------ API stub */

const RESUME_USER = {
  id: 3, name: 'Bilal Ahmed', email: 'bilal@gmail.com', role: 'candidate', status: 'active',
  job_role: 'Software Engineer', online: false, tokens_available: 5, latest_interview_id: 13,
  interview_status: 'invited', cnic: '4210112345673',
  course_category: RESUME_CATEGORY, course_status: null, bulk_batch_id: null,
};
const ENROLLED_USER = {
  id: 1, name: 'Ali Raza', email: 'ali@gmail.com', role: 'candidate', status: 'active',
  job_role: 'frontend', online: true, tokens_available: 3, latest_interview_id: 11,
  interview_status: 'interview_completed', cnic: '4210112345671',
  course_category: 'AI', course_status: 'completed', bulk_batch_id: null,
};
const BULK_USER = {
  id: 2, name: 'Sara Khan', email: 'sara@gmail.com', role: 'candidate', status: 'active',
  job_role: 'backend', online: false, tokens_available: 0, latest_interview_id: null,
  interview_status: 'invited', cnic: '4210112345672',
  course_category: 'AI', course_status: 'completed', bulk_batch_id: 7,
};

const RESUME_RECORD = {
  id: 55,
  user_id: 3,
  file_name: 'bilal-cv.pdf',
  resume_score: 78,
  extracted_skills: JSON.stringify(['React', 'PostgreSQL']),
  extracted_projects: JSON.stringify(['MediTrack - clinic booking']),
  raw_text: 'Bilal Ahmed\nSkills\nReact, PostgreSQL\nProjects\nMediTrack',
  flagged_at: null,
  flag_reason: null,
};

const REPORT = {
  scoring_status: 'complete',
  interview: {
    id: 13, user_id: 3, type: 'resume_based', job_role: 'Software Engineer',
    experience_level: 'Entry', difficulty: 'Medium', status: 'completed',
    is_proctor_failed: false, proctor_violations_count: 0, has_video: false,
    created_at: new Date().toISOString(), proctor_logs: '[]',
  },
  report: {
    overall_score: 72, technical_score: 70, communication_score: 74, confidence_score: 68,
    strengths: JSON.stringify(['Clear explanations']),
    weaknesses: JSON.stringify(['Shallow on indexing']),
    recommendations: 'Read up on query plans.',
    missing_concepts: 'Indexing',
  },
  qna: [
    {
      question: {
        id: 1, question_text: 'Walk me through MediTrack.',
        question_type: 'scenario', derived_from: 'MediTrack - clinic booking',
      },
      response: { response_text: 'It books clinic appointments.', score: 75, feedback: 'Good.' },
    },
    {
      question: {
        id: 2, question_text: 'How would you shard a Kubernetes cluster?',
        question_type: 'conceptual', derived_from: null,
      },
      response: { response_text: 'Not sure.', score: 30, feedback: 'Weak.' },
    },
  ],
};

const apiData = {
  '/admin/users': [ENROLLED_USER, BULK_USER, RESUME_USER],
  '/admin/pending-actions/count': { total: 0 },
  '/admin/bulk-email/batches': [],
  '/admin/proctor-snapshots': [],
  '/admin/users/3/resume': { has_resume: true, resume: RESUME_RECORD, flagged_by_name: null },
  '/interviews/13/report': REPORT,
  '/auth/signup-options': {
    categories: ['AI', 'Instructor', RESUME_CATEGORY],
    ongoing_enabled: false,
    resume_category: RESUME_CATEGORY,
  },
  '/feedback/interview/13': { submitted: false },
  '/admin/interviews/13/video-url': { video_url: null },
};

const postMock = vi.fn(() => Promise.resolve({ data: {} }));

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn((url) => {
      const path = String(url).split('?')[0];
      return Promise.resolve({ data: apiData[path] ?? {} });
    }),
    post: (...args) => postMock(...args),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

let currentUser = { id: 99, name: 'Admin User', email: 'admin@example.com', role: 'admin' };

// RegisterPage renders ThemeToggle, which reads ThemeContext.
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, toggleTheme: vi.fn() }),
  ThemeProvider: ({ children }) => children,
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: currentUser,
    register: vi.fn(() => Promise.resolve({ status: 'resume_pending_login' })),
    logout: vi.fn(),
    clearError: vi.fn(),
    error: '',
    loading: false,
  }),
  AuthProvider: ({ children }) => children,
}));

beforeEach(() => {
  // Explicit rather than relying on auto-cleanup: if one of the heavier mounts below times
  // out, its tree is left in the document and the NEXT test then finds two of everything —
  // which is how this file failed only when run alongside the rest of the suite.
  cleanup();
  postMock.mockClear();
  currentUser = { id: 99, name: 'Admin User', email: 'admin@example.com', role: 'admin' };
});

const renderAt = async (Component, path = '/', route = '/') => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={<Component />} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(document.body.textContent.length).toBeGreaterThan(0));
};

/* ------------------------------------------------------------------ constants */

describe('category helpers', () => {
  it('recognises the category regardless of casing', () => {
    expect(isResumeCategory(RESUME_CATEGORY)).toBe(true);
    expect(isResumeCategory('resume-based interview')).toBe(true);
    expect(isResumeCategory('AI')).toBe(false);
  });

  it('exempts it from course status, and nothing else', () => {
    expect(hasCourseStatus(RESUME_CATEGORY)).toBe(false);
    expect(hasCourseStatus('Instructor')).toBe(false);
    expect(hasCourseStatus('AI')).toBe(true);
  });
});

/* --------------------------------------------------------------- Manage Users */

describe('Manage Users tabs', () => {
  it('gives the category its own tab', async () => {
    const { default: AdminUsersPage } = await import('./AdminUsersPage');
    await renderAt(AdminUsersPage);
    await waitFor(() => expect(screen.getByText(/Resume-Based/i)).toBeTruthy());
  }, 20000);

  it('counts every account exactly once across the three tabs', async () => {
    const { default: AdminUsersPage } = await import('./AdminUsersPage');
    await renderAt(AdminUsersPage);

    // One resume candidate, one organic, one bulk — and the resume candidate must NOT also
    // be counted under Enrolled Users just because they have no bulk_batch_id.
    await waitFor(() => expect(screen.getByRole('button', { name: /resume-based/i })).toBeTruthy());
    const total = ['enrolled users', 'bulk invited', 'resume-based']
      .map((name) => screen.getByRole('button', { name: new RegExp(name, 'i') }))
      .map((btn) => Number((btn.textContent.match(/(\d+)\s*$/) || [0, 0])[1]));
    expect(total.reduce((a, b) => a + b, 0)).toBe(3);
  }, 20000);

  it('shows only the resume candidate under that tab', async () => {
    const { default: AdminUsersPage } = await import('./AdminUsersPage');
    await renderAt(AdminUsersPage, '/admin/users?tab=resume', '/admin/users');
    await waitFor(() => expect(screen.getByText('Bilal Ahmed')).toBeTruthy());
    expect(screen.queryByText('Ali Raza')).toBeNull();
    expect(screen.queryByText('Sara Khan')).toBeNull();
  }, 20000);

  it('keeps the resume candidate out of Enrolled Users', async () => {
    const { default: AdminUsersPage } = await import('./AdminUsersPage');
    await renderAt(AdminUsersPage, '/admin/users?tab=enrolled', '/admin/users');
    await waitFor(() => expect(screen.getByText('Ali Raza')).toBeTruthy());
    expect(screen.queryByText('Bilal Ahmed')).toBeNull();
  }, 20000);
});

/* ----------------------------------------------------------- enrolment form */

describe('enrolment form', () => {
  beforeEach(() => {
    currentUser = null;
  });

  it('replaces Course Status with a resume upload for this category', async () => {
    const { default: RegisterPage } = await import('./RegisterPage');
    await renderAt(RegisterPage);

    await waitFor(() => expect(screen.getByLabelText(/Category/i)).toBeTruthy());
    expect(screen.getByLabelText(/Course Status/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: RESUME_CATEGORY } });

    await waitFor(() => expect(screen.queryByLabelText(/Course Status/i)).toBeNull());
    expect(screen.getByText(/Upload your resume|Enter your email and CNIC first/i)).toBeTruthy();
  });

  it('sends the resume as multipart, not JSON', async () => {
    // THE BUG THIS PINS: the shared api instance defaults to
    // Content-Type: application/json. FormData sent under that header never gets a
    // multipart boundary, so the server parses nothing and rejects every field as
    // missing — which is exactly how this shipped the first time. Five other uploads in
    // this app override the header; forgetting it produces a 422 that names the fields
    // you can plainly see being appended, so it reads as a server bug rather than a
    // client one.
    const { default: RegisterPage } = await import('./RegisterPage');
    await renderAt(RegisterPage);

    fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: RESUME_CATEGORY } });
    // By id, not by label: the shared Input component renders its <label> without a
    // htmlFor, so getByLabelText cannot reach these two fields.
    fireEvent.change(document.getElementById('email'), { target: { value: 'bilal@gmail.com' } });
    fireEvent.change(document.getElementById('cnic'), { target: { value: '4210112345673' } });

    const input = await waitFor(() => {
      const el = document.querySelector('input[type="file"]');
      expect(el).toBeTruthy();
      expect(el.disabled).toBe(false);
      return el;
    });

    const file = new File(['Skills\nReact\nExperience\nACME'], 'cv.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(postMock).toHaveBeenCalled());
    const [url, body, config] = postMock.mock.calls[0];
    expect(url).toBe('/auth/signup-resume');
    expect(body).toBeInstanceOf(FormData);
    expect(config?.headers?.['Content-Type']).toBe('multipart/form-data');
    // All three fields the endpoint requires actually make it into the body.
    expect(body.get('resume')).toBeTruthy();
    expect(body.get('cnic')).toBe('42101-1234567-3');
    expect(body.get('email')).toBe('bilal@gmail.com');
  }, 20000);

  it('will not accept the upload until the email and CNIC are valid', async () => {
    const { default: RegisterPage } = await import('./RegisterPage');
    await renderAt(RegisterPage);

    fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: RESUME_CATEGORY } });
    // The upload is attributed server-side to a CNIC and email, so it cannot be sent first.
    await waitFor(() => expect(screen.getByText(/Enter your email and CNIC first/i)).toBeTruthy());
  });
});

/* ----------------------------------------------------- report traceability */

describe('report traceability', () => {
  it('names the resume entry a question came from', async () => {
    const { default: ReportDetailPage } = await import('./ReportDetailPage');
    await renderAt(ReportDetailPage, '/interview/report/13', '/interview/report/:id');

    await waitFor(() => expect(screen.getByText(/Walk me through MediTrack/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /transcript/i }));
    await waitFor(() => {
      // Scoped to the traceability line: the Resume panel lists the same project, and a
      // bare text match would pass even if the per-question source were never rendered.
      const trace = screen.getByText(/From resume:/i);
      expect(trace.textContent).toMatch(/MediTrack - clinic booking/);
    });
  }, 20000);

  it('calls out a question that traces back to nothing', async () => {
    const { default: ReportDetailPage } = await import('./ReportDetailPage');
    await renderAt(ReportDetailPage, '/interview/report/13', '/interview/report/:id');

    await waitFor(() => expect(screen.getByText(/Walk me through MediTrack/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /transcript/i }));
    // The Kubernetes question cites nothing on this CV — that has to be visible, not blank.
    await waitFor(() =>
      expect(screen.getByText(/Not traceable to any skill or project/i)).toBeTruthy()
    );
  }, 20000);

  it('hides traceability from the candidate', async () => {
    currentUser = { id: 3, name: 'Bilal Ahmed', email: 'bilal@gmail.com', role: 'candidate' };
    const { default: ReportDetailPage } = await import('./ReportDetailPage');
    await renderAt(ReportDetailPage, '/interview/report/13', '/interview/report/:id');

    await waitFor(() => expect(screen.getByText(/Walk me through MediTrack/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /transcript/i }));
    await waitFor(() => expect(screen.getByText(/Walk me through MediTrack/i)).toBeTruthy());
    expect(screen.queryByText(/Not traceable to any skill or project/i)).toBeNull();
    expect(screen.queryByText(/From resume:/i)).toBeNull();
  }, 20000);
});
