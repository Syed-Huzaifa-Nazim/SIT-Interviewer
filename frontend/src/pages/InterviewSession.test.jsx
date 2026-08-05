/**
 * Guards the interview session page against render-time crashes.
 *
 * Written after a live incident: a `useCallback` was added to InterviewSession without
 * adding it to the React import, so every session render threw
 * `ReferenceError: useCallback is not defined`. Candidates mid-interview got a blank
 * page and could not continue. `vite build` compiles that happily — an undefined
 * identifier is only a problem once the code actually runs — so nothing caught it
 * before production did.
 *
 * The important part of this test is simply THAT IT RENDERS. It mounts the page the way
 * OfficialInterviewStart does after "Begin Interview" — questions handed over through
 * router state, so the full JSX renders on the FIRST render, before any effect runs,
 * which is exactly the path that broke. It also covers the empty-questions refresh path.
 * The payload mirrors production interview #168 (sandbox opener + four verbal questions).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(() => new Promise(() => {})),
    post: vi.fn(() => new Promise(() => {})),
  },
}));

vi.mock('../services/proctorScreen', () => ({
  getScreenStream: vi.fn(() => null),
  hasScreenStream: vi.fn(() => false),
  clearScreenStream: vi.fn(),
}));

vi.mock('../services/identityCheck', () => ({
  loadFaceApi: vi.fn(() => Promise.resolve()),
  computeDescriptor: vi.fn(() => null),
  descriptorDistance: vi.fn(() => 0),
  getBaselineDescriptor: vi.fn(() => null),
  getBaselineImage: vi.fn(() => null),
  clearBaseline: vi.fn(),
  IDENTITY_MATCH_THRESHOLD: 0.5,
  IDENTITY_CHECK_INTERVAL_MS: 30000,
  IDENTITY_MISMATCH_STRIKES: 3,
}));

import InterviewSession from './InterviewSession';

// Exact shape of InterviewQuestion.to_dict() for production interview #168.
const QUESTIONS_168 = [
  { id: 727, interview_id: 168, question_text: 'Two Sum', question_type: 'coding_sandbox',
    code_snippet: null, sandbox_problem_id: 'two-sum', order_num: 1, time_limit_seconds: 600,
    started_at: null },
  { id: 728, interview_id: 168, question_text: 'Design a basic neural network architecture for image classification.',
    question_type: 'coding_scenario', code_snippet: null, sandbox_problem_id: null,
    order_num: 2, time_limit_seconds: 240, started_at: null },
  { id: 729, interview_id: 168, question_text: 'You are given a dataset with high dimensionality, how do you reduce it?',
    question_type: 'coding_logic', code_snippet: null, sandbox_problem_id: null,
    order_num: 3, time_limit_seconds: 180, started_at: null },
  { id: 730, interview_id: 168, question_text: 'What is the difference between a generative and discriminative model?',
    question_type: 'conceptual', code_snippet: null, sandbox_problem_id: null,
    order_num: 4, time_limit_seconds: 120, started_at: null },
  { id: 731, interview_id: 168, question_text: 'Identify the bug in this code snippet and explain the fix.',
    question_type: 'coding_debug', code_snippet: 'def f(x):\n  return x/0', sandbox_problem_id: null,
    order_num: 5, time_limit_seconds: 180, started_at: null },
];

const renderSession = (questions) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/interview/session/168', state: { questions } }]}>
      <Routes>
        <Route path="/interview/session/:id" element={<InterviewSession />} />
      </Routes>
    </MemoryRouter>
  );

describe('InterviewSession blank-screen reproduction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without throwing when questions arrive via router state (sandbox opener)', () => {
    let thrown = null;
    try {
      const { container } = renderSession(QUESTIONS_168);
      expect(container.innerHTML.length).toBeGreaterThan(0);
    } catch (e) {
      thrown = e;
    }
    if (thrown) {
      // Surface the real error and stack — this is the whole point of the harness.
      console.error('\n*** RENDER THREW ***\n' + (thrown && thrown.stack ? thrown.stack : String(thrown)) + '\n');
    }
    expect(thrown).toBeNull();
  });

  it('renders without throwing when there are no questions yet (refresh path)', () => {
    let thrown = null;
    try {
      renderSession([]);
    } catch (e) {
      thrown = e;
    }
    if (thrown) {
      console.error('\n*** EMPTY-QUESTIONS RENDER THREW ***\n' + (thrown && thrown.stack ? thrown.stack : String(thrown)) + '\n');
    }
    expect(thrown).toBeNull();
  });
});
