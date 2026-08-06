import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminFilter, facetOptions, hasActiveFilters, applyFacets } from './filter';

const rows = [
  { id: 1, status: 'active', course: 'AI', flagged: true },
  { id: 2, status: 'banned', course: 'AI', flagged: false },
  { id: 3, status: 'active', course: 'Cloud', flagged: false },
  { id: 4, status: 'active', course: null, flagged: false },
];

describe('facetOptions', () => {
  it('counts each value', () => {
    const opts = facetOptions(rows, (r) => r.status);
    expect(opts).toEqual([
      { value: 'active', label: 'active', count: 3 },
      { value: 'banned', label: 'banned', count: 1 },
    ]);
  });

  it('honours a caller-defined order and labels', () => {
    const opts = facetOptions(rows, (r) => r.status, {
      order: ['banned', 'active'],
      labels: { active: 'Active', banned: 'Banned' },
    });
    expect(opts.map((o) => o.label)).toEqual(['Banned', 'Active']);
  });

  it('skips empty values unless asked for them', () => {
    expect(facetOptions(rows, (r) => r.course).map((o) => o.value)).toEqual(['AI', 'Cloud']);
    const withEmpty = facetOptions(rows, (r) => r.course, { includeEmpty: true });
    expect(withEmpty.find((o) => o.value === '—')).toEqual({ value: '—', label: '—', count: 1 });
  });
});

describe('applyFacets', () => {
  const accessors = { status: (r) => r.status, course: (r) => r.course };

  it('returns everything when nothing is selected', () => {
    expect(applyFacets(rows, { status: [] }, accessors)).toHaveLength(4);
  });

  it('filters within a facet as OR', () => {
    const out = applyFacets(rows, { status: ['active', 'banned'] }, accessors);
    expect(out).toHaveLength(4);
  });

  it('combines separate facets as AND', () => {
    const out = applyFacets(rows, { status: ['active'], course: ['AI'] }, accessors);
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it('matches rows with no value under the empty marker', () => {
    const out = applyFacets(rows, { course: ['—'] }, accessors);
    expect(out.map((r) => r.id)).toEqual([4]);
  });
});

describe('hasActiveFilters', () => {
  it('is false for empty selections', () => {
    expect(hasActiveFilters({ a: [], b: [] })).toBe(false);
  });
  it('is true once anything is chosen', () => {
    expect(hasActiveFilters({ a: [], b: ['x'] })).toBe(true);
  });
});

describe('AdminFilter', () => {
  const groups = [
    { key: 'status', label: 'Status', options: facetOptions(rows, (r) => r.status) },
    { key: 'course', label: 'Course', options: facetOptions(rows, (r) => r.course) },
  ];

  it('renders nothing when there is nothing to filter by', () => {
    const { container } = render(<AdminFilter groups={[]} value={{}} onChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('opens a checklist and reports a selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AdminFilter groups={groups} value={{}} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));

    expect(await screen.findByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Course')).toBeInTheDocument();
    // Counts are shown so the value of a filter is visible before applying it.
    expect(screen.getByText('3')).toBeInTheDocument();

    await user.click(screen.getByText('banned'));
    expect(onChange).toHaveBeenCalledWith({ status: ['banned'] });
  });

  it('shows how many filters are active and clears them', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AdminFilter groups={groups} value={{ status: ['active'], course: ['AI'] }} onChange={onChange} />);

    // Two active facets -> badge of 2, and an accessible label that says so.
    expect(screen.getByRole('button', { name: 'Filters, 2 active' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filters, 2 active' }));
    await user.click(await screen.findByText('Clear all'));
    expect(onChange).toHaveBeenCalledWith({ status: [], course: [] });
  });

  it('unchecks a value that is already selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AdminFilter groups={groups} value={{ status: ['active'] }} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Filters, 1 active' }));
    await user.click(await screen.findByText('active'));
    expect(onChange).toHaveBeenCalledWith({ status: [] });
  });
});
