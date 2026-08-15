import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotificationsMenu from './NotificationsMenu';

/**
 * Notifications became navigable, which introduced two things worth pinning:
 *
 *  - `link` is a plain string column, so it is untrusted input to the router. Anything that
 *    isn't an in-app path must not be navigated to.
 *  - A notification with no usable destination must not render as a button, or the candidate
 *    gets a control that looks clickable and does nothing.
 */

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const notif = (over = {}) => ({
  id: 1,
  title: 'Interview Evaluation Ready!',
  message: 'Your report is complete.',
  type: 'interview',
  is_read: false,
  link: null,
  created_at: new Date().toISOString(),
  ...over,
});

const renderMenu = (notifications, onMarkAllRead = vi.fn()) =>
  render(
    <MemoryRouter>
      <NotificationsMenu notifications={notifications} onMarkAllRead={onMarkAllRead} />
    </MemoryRouter>
  );

const openMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
};

describe('NotificationsMenu', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the unread count on the bell', () => {
    renderMenu([notif({ id: 1 }), notif({ id: 2 }), notif({ id: 3, is_read: true })]);
    expect(screen.getByRole('button', { name: /2 unread/i })).toBeInTheDocument();
  });

  it('caps a large unread count rather than stretching the badge', () => {
    renderMenu(Array.from({ length: 14 }, (_, i) => notif({ id: i })));
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('navigates to the stored link when one is present', async () => {
    renderMenu([notif({ link: '/interview/report/42' })]);
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: /Interview Evaluation Ready/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/interview/report/42');
  });

  it('falls back to the type route when there is no link', async () => {
    // Every notification written before the link column existed lands here.
    renderMenu([notif({ type: 'token', title: 'Tokens Purchased', link: null })]);
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: /Tokens Purchased/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/profile');
  });

  it.each([
    ['https://evil.example/steal', 'absolute URL'],
    ['//evil.example', 'protocol-relative URL'],
    ['javascript:alert(1)', 'javascript scheme'],
    ['', 'empty string'],
  ])('never navigates to %s (%s)', async (link) => {
    // Falls back to the type route instead of trusting the stored value.
    renderMenu([notif({ type: 'interview', link })]);
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: /Interview Evaluation Ready/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/history');
    expect(mockNavigate).not.toHaveBeenCalledWith(link);
  });

  it('renders a notification with nowhere to go as plain text, not a button', async () => {
    // 'activity' has no fallback route and this one carries no link.
    renderMenu([notif({ type: 'activity', title: 'Interview Terminated', link: null })]);
    await openMenu();
    expect(screen.getByText('Interview Terminated')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Interview Terminated/i })).not.toBeInTheDocument();
  });

  it('marks everything read on request', async () => {
    const onMarkAllRead = vi.fn();
    renderMenu([notif()], onMarkAllRead);
    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('offers nothing to mark when everything is already read', async () => {
    renderMenu([notif({ is_read: true })]);
    await openMenu();
    expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument();
  });

  it('shows an empty state rather than a blank panel', async () => {
    renderMenu([]);
    await openMenu();
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    renderMenu([notif()]);
    await openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
