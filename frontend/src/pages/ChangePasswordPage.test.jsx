/**
 * The forced password change.
 *
 * WHY THIS PAGE EXISTS AND WHY IT IS TESTED
 * -----------------------------------------
 * An admin created by the super admin is issued a generated password and emailed it. Until
 * they replace it, that password is a live credential sitting in a mailbox — readable by
 * anyone who ever gains access to that inbox, for as long as the account exists. The
 * backend refuses the entire admin surface to such an account, so this page is the only
 * thing they can reach; if it breaks, the account is simply unusable with no way forward
 * and no error that explains why.
 *
 * The assertion that matters most is the last one: changing the password signs them out.
 * Every session opened with the old password is revoked server-side, this one included, so
 * a page that kept them "signed in" would be showing a session the API has already killed —
 * every subsequent request 401s and it looks like the change failed.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const post = vi.fn();
const logout = vi.fn();

vi.mock('../services/api', () => ({
  default: { post: (...args) => post(...args) },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ logout }),
}));

vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), isDark: false }),
  ThemeProvider: ({ children }) => children,
}));

import ChangePasswordPage from './ChangePasswordPage';

const GOOD = 'a-long-enough-password';

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { message: 'ok', reauthentication_required: true } });
  logout.mockReset();
  vi.useRealTimers();
});

async function fill(user, { current = 'emailed-one', next = GOOD, confirm = GOOD } = {}) {
  await user.type(screen.getByLabelText('The password you were emailed'), current);
  await user.type(screen.getByLabelText('New password'), next);
  await user.type(screen.getByLabelText('Confirm new password'), confirm);
}

describe('ChangePasswordPage', () => {
  it('explains why it is being shown', async () => {
    render(<ChangePasswordPage />);
    expect(screen.getByText(/password that was emailed to you/i)).toBeInTheDocument();
  });

  it('sends both passwords', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /Set my password/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/change-password', {
        current_password: 'emailed-one',
        new_password: GOOD,
      })
    );
  });

  it('refuses a password shorter than the admin minimum, before the round trip', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);
    await fill(user, { next: 'short', confirm: 'short' });

    expect(screen.getByText(/At least 12 characters/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set my password/ })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses a mistyped confirmation', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);
    await fill(user, { confirm: 'a-different-password' });

    expect(screen.getByText('These do not match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set my password/ })).toBeDisabled();
  });

  it('will not submit without the emailed password', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);
    await user.type(screen.getByLabelText('New password'), GOOD);
    await user.type(screen.getByLabelText('Confirm new password'), GOOD);

    expect(screen.getByRole('button', { name: /Set my password/ })).toBeDisabled();
  });

  it('surfaces a rejected current password instead of appearing to succeed', async () => {
    post.mockRejectedValue({
      response: { data: { message: 'Your current password is not correct.' } },
    });
    const user = userEvent.setup();
    render(<ChangePasswordPage />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /Set my password/ }));

    expect(await screen.findByText('Your current password is not correct.')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('signs the person out afterwards, because the server revoked this session too', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /Set my password/ }));

    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    // Says so before it happens, rather than dumping them at a login screen unexplained.
    expect(screen.getByText(/Every session opened with the old password has ended/)).toBeInTheDocument();

    await waitFor(() => expect(logout).toHaveBeenCalled(), { timeout: 15000 });
    // The page deliberately waits ~1.8s so the explanation can be read before the sign-out.
    // Typing three fields plus that wait sits close enough to vitest's 5s default that it
    // flakes under full-suite load — a slow machine, not a broken page. The budget is
    // raised on the test itself; the waitFor above was never the limit that fired.
  }, 30000);
});
