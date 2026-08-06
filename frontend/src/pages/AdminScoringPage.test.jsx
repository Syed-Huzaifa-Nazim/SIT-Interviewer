/**
 * AdminScoringPage — LLM scoring audit dashboard (TEST_CASES.md §7).
 *
 * The dashboard's whole purpose is to make low-confidence AI evaluations VISIBLE to an
 * admin, so the flagged-count rendering is treated as a first-class assertion here, not a
 * cosmetic detail — it is the UI half of the project's anti-fabrication rule.
 *
 * The API module is mocked, so no network call and no backend are involved.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../services/api', () => ({
  default: { get: vi.fn() },
}))

// ThemeContext only supplies chart colours here; stubbing it keeps the test free of
// provider plumbing that has nothing to do with what is being verified.
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}))

// Recharts measures its container, which jsdom reports as 0x0 — the chart then renders
// nothing and hides the surrounding markup. A minimal stand-in keeps the assertions on
// this page's own logic rather than on a third-party chart library.
vi.mock('recharts', () => {
  const Passthrough = ({ children }) => <div>{children}</div>
  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    Bar: Passthrough,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    CartesianGrid: () => null,
  }
})

import api from '../services/api'
import AdminScoringPage from './AdminScoringPage'

const analyticsFixture = {
  overview: {
    total_interviews: 2,
    total_evaluations: 10,
    avg_score: 72.5,
    avg_confidence: 81.0,
    flagged_evaluations: 3,
    score_distribution: [
      { range: '0-20', count: 1 },
      { range: '20-40', count: 1 },
      { range: '40-60', count: 2 },
      { range: '60-80', count: 3 },
      { range: '80-100', count: 3 },
    ],
  },
  interviews: [
    {
      interview_id: 11,
      candidate_name: 'Ayesha Khan',
      job_role: 'Frontend Developer',
      type: 'technical',
      question_count: 5,
      avg_score: 78.0,
      avg_confidence: 88.0,
      flagged_count: 2,
      overall_score: 78,
      created_at: '2026-07-20T10:00:00',
    },
    {
      interview_id: 12,
      candidate_name: 'Bilal Ahmed',
      job_role: 'Backend Developer',
      type: 'technical',
      question_count: 5,
      avg_score: 67.0,
      avg_confidence: 74.0,
      flagged_count: 0,
      overall_score: 67,
      created_at: '2026-07-21T10:00:00',
    },
  ],
}

const emptyFixture = {
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
}

beforeEach(() => {
  api.get.mockReset()
})

// The drill-in now reads/writes ?interview_id= via useSearchParams, which requires a
// Router context — rendering the bare component without one throws.
const renderPage = () => render(
  <MemoryRouter>
    <AdminScoringPage />
  </MemoryRouter>
)

describe('AdminScoringPage', () => {
  it('shows a loading state before the analytics arrive', () => {
    // covers TC-ADM-016 (loading path)
    api.get.mockReturnValue(new Promise(() => {})) // never resolves

    renderPage()

    expect(screen.getByText(/loading scoring analytics/i)).toBeInTheDocument()
  })

  it('renders the overview stats from the API', async () => {
    // covers TC-ADM-016
    api.get.mockResolvedValue({ data: analyticsFixture })

    renderPage()

    expect(await screen.findByText('10')).toBeInTheDocument() // evaluations
    expect(screen.getByText('72.5%')).toBeInTheDocument() // avg score
    expect(screen.getByText('81%')).toBeInTheDocument() // avg confidence
  })

  it('surfaces the flagged-evaluation count to the admin', async () => {
    // covers TC-ADM-019 / TC-AI-015 — the UI half of the anti-fabrication rule.
    api.get.mockResolvedValue({ data: analyticsFixture })

    renderPage()

    const flaggedCard = (await screen.findByText(/flagged for review/i)).closest('div')
    expect(flaggedCard).toHaveTextContent('3')
  })

  it('lists every completed interview returned by the API', async () => {
    // covers TC-ADM-016
    api.get.mockResolvedValue({ data: analyticsFixture })

    renderPage()

    expect(await screen.findByText('Ayesha Khan')).toBeInTheDocument()
    expect(screen.getByText('Bilal Ahmed')).toBeInTheDocument()
  })

  it('badges a row that has flagged answers and dashes one that does not', async () => {
    // covers TC-ADM-019 — per-interview flagged counts must be distinguishable at a glance.
    api.get.mockResolvedValue({ data: analyticsFixture })

    renderPage()

    const flaggedRow = (await screen.findByText('Ayesha Khan')).closest('tr')
    expect(flaggedRow).toHaveTextContent('2')

    const cleanRow = screen.getByText('Bilal Ahmed').closest('tr')
    expect(cleanRow).toHaveTextContent('—')
  })

  it('renders zeros and an empty-state message on a fresh platform', async () => {
    // covers TC-ADM-021 — an empty dataset must not crash the dashboard.
    api.get.mockResolvedValue({ data: emptyFixture })

    renderPage()

    expect(await screen.findByText(/no completed interviews to analyse yet/i)).toBeInTheDocument()
    expect(screen.getByText(/no completed interviews with scored answers yet/i)).toBeInTheDocument()
  })

  it('shows an error alert when the analytics request fails', async () => {
    // covers TC-ADM-016 (failure path) — a failed load must be reported, not left blank.
    api.get.mockRejectedValue(new Error('network down'))

    renderPage()

    expect(await screen.findByText(/failed to load scoring analytics/i)).toBeInTheDocument()
  })

  it('opens the per-question breakdown when a row is clicked', async () => {
    // covers TC-ADM-022
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/admin/scoring/analytics') return Promise.resolve({ data: analyticsFixture })
      return Promise.resolve({
        data: {
          interview: {
            candidate_name: 'Ayesha Khan',
            job_role: 'Frontend Developer',
            type: 'technical',
            difficulty: 'Medium',
            overall_score: 78,
          },
          questions: [
            {
              question: 'Explain the virtual DOM.',
              transcript: 'It is a lightweight copy of the real DOM...',
              rationale: 'Accurate and well explained.',
              score: 85,
              confidence: 90,
              flagged: false,
            },
            {
              question: 'What is memoization?',
              transcript: '',
              rationale: '',
              score: 30,
              confidence: 20,
              flagged: true,
            },
          ],
        },
      })
    })

    renderPage()

    await user.click(await screen.findByText('Ayesha Khan'))

    expect(await screen.findByText('Explain the virtual DOM.')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/admin/scoring/interviews/11')
  })

  it('marks a low-confidence answer as flagged in the breakdown', async () => {
    // covers TC-ADM-022 / TC-AI-015 — the reviewer must see WHICH answer needs review.
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/admin/scoring/analytics') return Promise.resolve({ data: analyticsFixture })
      return Promise.resolve({
        data: {
          interview: {
            candidate_name: 'Ayesha Khan',
            job_role: 'Frontend Developer',
            type: 'technical',
            difficulty: 'Medium',
            overall_score: 78,
          },
          questions: [
            {
              question: 'What is memoization?',
              transcript: '',
              rationale: '',
              score: 30,
              confidence: 20,
              flagged: true,
            },
          ],
        },
      })
    })

    renderPage()
    await user.click(await screen.findByText('Ayesha Khan'))

    expect(await screen.findByText(/flagged for manual review/i)).toBeInTheDocument()
  })

  it('returns to the overview from the breakdown', async () => {
    // covers TC-ADM-022 — navigation must not strand the admin in the detail view.
    const user = userEvent.setup()
    api.get.mockImplementation((url) => {
      if (url === '/admin/scoring/analytics') return Promise.resolve({ data: analyticsFixture })
      return Promise.resolve({
        data: {
          interview: {
            candidate_name: 'Ayesha Khan',
            job_role: 'Frontend Developer',
            type: 'technical',
            difficulty: 'Medium',
            overall_score: 78,
          },
          questions: [],
        },
      })
    })

    renderPage()
    await user.click(await screen.findByText('Ayesha Khan'))
    await user.click(await screen.findByRole('button', { name: /back to scoring analytics/i }))

    await waitFor(() => {
      expect(screen.getByText('Bilal Ahmed')).toBeInTheDocument()
    })
  })
})
