/**
 * The Bulk Email Module's Category dropdown, against the two shapes of /bulk-email/config
 * this frontend can actually meet in production.
 *
 * The grouped "Existing Interviews / SMIT Curriculum Interviews" rendering reads a
 * `category_groups` field that is newer than the flat `categories` list beside it. Frontend
 * and backend deploy independently here (Vercel and Railway), so a build that renders ONLY
 * from `category_groups` shows an empty dropdown for the whole window where the frontend is
 * live and the backend is not yet — which is exactly what happened, and made the module
 * unusable rather than merely unstyled. These pin the invariant that fixed it: every
 * category the server allows is selectable, however the server chose to describe it.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';

import BulkEmailModal from './BulkEmailModal';

const OLD_CATEGORIES = [
  'AI', 'Cloud & Data Engineering', 'Web and Mobile App Development',
  'Graphics and UI/UX Design', 'Instructor', 'Resume-Based Interview',
];
const SMIT_CATEGORIES = ['AI & Data Science — SMIT', 'UI/UX Design With AI — SMIT'];

// What a backend that predates the curriculum feature returns: the flat list, no groups.
const OLD_BACKEND_CONFIG = {
  required_columns: ['name', 'email', 'cnic', 'category', 'course_status'],
  categories: OLD_CATEGORIES,
  course_statuses: ['ongoing', 'completed'],
  deadline_choices: [2, 5, 7],
  default_deadline_days: 2,
  max_rows: 500,
  ongoing_enabled: false,
  difficulty_ranges: [{ value: 'EASY_MEDIUM', label: 'Easy - Medium' }],
  companies: [],
};

const NEW_BACKEND_CONFIG = {
  ...OLD_BACKEND_CONFIG,
  categories: [...OLD_CATEGORIES, ...SMIT_CATEGORIES],
  category_groups: { existing: OLD_CATEGORIES, smit: SMIT_CATEGORIES },
};

let config = OLD_BACKEND_CONFIG;

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn((url) => {
      const path = String(url).split('?')[0];
      if (path === '/admin/bulk-email/config') return Promise.resolve({ data: config });
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

/** The "Apply to all" Category select, once config has loaded and a row exists. */
async function openWithOneRow() {
  render(<BulkEmailModal open onClose={() => {}} onSent={() => {}} />);
  const addRow = await screen.findByText(/Add Recipient Manually/i);
  fireEvent.click(addRow.closest('button') || addRow);
  return await waitFor(() => {
    const select = screen.getAllByRole('combobox')
      .find((el) => Array.from(el.options).some((o) => o.textContent === 'Category…'));
    expect(select).toBeTruthy();
    return select;
  });
}

const optionValues = (select) =>
  Array.from(select.querySelectorAll('option')).map((o) => o.value).filter(Boolean);

beforeEach(() => {
  cleanup();
  config = OLD_BACKEND_CONFIG;
});

describe('Category options survive a backend that sends no category_groups', () => {
  it('offers every category from the flat list when the server describes no groups', async () => {
    const select = await openWithOneRow();
    expect(optionValues(select)).toEqual(OLD_CATEGORIES);
  });

  it('still groups them when the server does describe groups', async () => {
    config = NEW_BACKEND_CONFIG;
    const select = await openWithOneRow();

    const labels = Array.from(select.querySelectorAll('optgroup')).map((g) => g.label);
    expect(labels).toEqual(['Existing Interviews', 'SMIT Curriculum Interviews']);
    // Grouped or not, the full allow-list is what remains selectable.
    expect(optionValues(select).sort()).toEqual([...OLD_CATEGORIES, ...SMIT_CATEGORIES].sort());
  });

  it('keeps a category the server allows but places in no group', async () => {
    // The half-described case: groups present, but one allowed value missing from both.
    // It must still be selectable rather than silently dropped.
    config = {
      ...NEW_BACKEND_CONFIG,
      categories: [...OLD_CATEGORIES, ...SMIT_CATEGORIES, 'Some New Track'],
    };
    const select = await openWithOneRow();
    expect(optionValues(select)).toContain('Some New Track');
  });
});
