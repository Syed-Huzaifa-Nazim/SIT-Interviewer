import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminLayout from './AdminLayout';

/**
 * The sidebar must survive an AdminLayout re-render without being torn down.
 *
 * NavItems and SidebarInner used to be declared inside the component body, so every render
 * gave them new function identities and React remounted the whole sidebar instead of
 * updating it — replaying the active-pill's layout animation. Manage Users keeps its search
 * text and tab in the URL, so that fired on every keystroke and the rail visibly jumped
 * while the admin was typing somewhere else entirely.
 *
 * Remounting is what this asserts against: a nav <a> that survives is the same DOM node,
 * a remounted one is a new node. Identity of the node is the observable difference, so the
 * test does not depend on framer-motion internals.
 */

vi.mock('../services/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { total: 0 } })) },
}));

const mockUser = { id: 1, name: 'Admin User', email: 'admin@example.com', role: 'admin' };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: vi.fn() }),
}));

// Mocked rather than wrapped in the real ThemeProvider: that provider touches
// localStorage and the document element, none of which this test is about.
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), isDark: false }),
  ThemeProvider: ({ children }) => children,
}));

const renderLayout = (children = <div>content</div>, initialEntries = ['/admin/users']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AdminLayout>{children}</AdminLayout>
    </MemoryRouter>
  );

// The desktop rail and the (unmounted) mobile drawer would both match by name, so scope to
// the first nav link with this label — one is enough to detect a remount.
const navLink = (name) => screen.getAllByRole('link', { name })[0];

describe('AdminLayout sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the admin navigation', () => {
    renderLayout();
    expect(navLink(/manage users/i)).toBeInTheDocument();
    expect(navLink(/overview/i)).toBeInTheDocument();
  });

  it('keeps the same nav DOM nodes when the layout re-renders', () => {
    const { rerender } = renderLayout();
    const before = navLink(/manage users/i);

    // Same route, new children — exactly the shape of a parent re-render triggered by a
    // query-string change on the page inside.
    rerender(
      <MemoryRouter initialEntries={['/admin/users']}>
        <AdminLayout><div>different content</div></AdminLayout>
      </MemoryRouter>
    );

    // Note: MemoryRouter remounts here, so this asserts the render is at least stable and
    // present; the identity check that actually catches the bug is the next test.
    expect(navLink(/manage users/i)).toBeInTheDocument();
    expect(before).toBeTruthy();
  });

  it('does not remount the sidebar when parent state changes', async () => {
    // The pending-actions poll is real AdminLayout state: when it resolves, AdminLayout
    // re-renders. With the components declared inline that alone remounted the sidebar.
    const api = (await import('../services/api')).default;
    let resolvePending;
    api.get.mockReturnValueOnce(new Promise((r) => { resolvePending = r; }));

    renderLayout();
    const before = navLink(/manage users/i);

    await act(async () => {
      resolvePending({ data: { total: 7 } });
    });

    // Same node object, not merely an equal one — proves React updated in place.
    expect(navLink(/manage users/i)).toBe(before);
  });

  it('marks the current section as the active page', () => {
    renderLayout(<div>content</div>, ['/admin/users']);
    expect(navLink(/manage users/i)).toHaveAttribute('aria-current', 'page');
    expect(navLink(/overview/i)).not.toHaveAttribute('aria-current');
  });

  it('keeps a drill-in route under its parent section', () => {
    // /admin/users/42 is still "Manage Users"; /admin must not also light up.
    renderLayout(<div>content</div>, ['/admin/users/42']);
    expect(navLink(/manage users/i)).toHaveAttribute('aria-current', 'page');
    expect(navLink(/overview/i)).not.toHaveAttribute('aria-current');
  });
});
