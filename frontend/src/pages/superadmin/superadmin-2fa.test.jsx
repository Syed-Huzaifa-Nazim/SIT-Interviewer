/**
 * The super admin sign-in, now that a password alone is not enough.
 *
 * WHAT MUST NOT REGRESS
 * ---------------------
 * The whole second factor is worth nothing if the page stores a session on the strength of
 * the password step. That is easy to reintroduce — it is what the page did a commit ago,
 * and the response still carries a JSON body that looks like a successful login. So the
 * first assertion here is the negative one: after a correct password, nothing is saved.
 *
 * The recovery path is tested as carefully as the happy path because it is the one people
 * reach for while already locked out and under pressure. If the field silently sends a
 * recovery code to the check meant for the emailed one, it burns a single-use code and
 * fails, which is the worst possible outcome at the worst possible moment.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const post = vi.fn();

vi.mock('../../services/superAdminApi', async () => {
  const actual = await vi.importActual('../../services/superAdminApi');
  return {
    ...actual,
    default: { post: (...args) => post(...args), get: vi.fn(() => Promise.resolve({ data: [] })) },
  };
});

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn(), isDark: false }),
  ThemeProvider: ({ children }) => children,
}));

import SuperAdminLoginPage from './SuperAdminLoginPage';
import { SUPERADMIN_TOKEN_KEY } from '../../services/superAdminApi';

const CHALLENGE = {
  twofactor_required: true,
  challenge: 'challenge-token',
  sent_to: 'a****@example.com',
  expires_in_minutes: 10,
  recovery_available: true,
};

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/superadmin/login']}>
      <Routes>
        <Route path="/superadmin/login" element={<SuperAdminLoginPage />} />
        <Route path="/superadmin" element={<div>portal</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function submitPassword(user) {
  await user.type(screen.getByLabelText('Email'), 'admin@interviewer.com');
  await user.type(screen.getByLabelText('Password'), 'correct-horse-battery');
  await user.click(screen.getByRole('button', { name: /Continue/ }));
}

beforeEach(() => {
  localStorage.clear();
  post.mockReset();
  post.mockImplementation((url) => {
    if (url === '/superadmin/login') return Promise.resolve({ data: CHALLENGE });
    return Promise.resolve({
      data: {
        access_token: 'real-token',
        user: { id: 1, email: 'admin@interviewer.com', role: 'super_admin' },
        recovery_codes_remaining: 7,
      },
    });
  });
});

afterEach(() => localStorage.clear());

describe('step one: password', () => {
  it('does NOT store a session on a correct password', async () => {
    const user = userEvent.setup();
    renderLogin();
    await submitPassword(user);

    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
    // The heart of it: the password step must not be a sign-in.
    expect(localStorage.getItem(SUPERADMIN_TOKEN_KEY)).toBeNull();
  });

  it('says which mailbox the code went to, masked', async () => {
    const user = userEvent.setup();
    renderLogin();
    await submitPassword(user);

    // Enough to know which inbox to open; not enough to hand an address to whoever is
    // holding a stolen password.
    expect(await screen.findByText('a****@example.com')).toBeInTheDocument();
  });

  it('shows the error and stays on step one when the password is wrong', async () => {
    post.mockImplementation(() =>
      Promise.reject({ response: { data: { message: 'Invalid credentials.' } } })
    );
    const user = userEvent.setup();
    renderLogin();
    await submitPassword(user);

    expect(await screen.findByText('Invalid credentials.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });
});

describe('step two: the code', () => {
  it('sends the emailed code as `code` and signs in', async () => {
    const user = userEvent.setup();
    renderLogin();
    await submitPassword(user);

    await user.type(await screen.findByLabelText('Sign-in code'), '123456');
    await user.click(screen.getByRole('button', { name: /Verify and sign in/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/superadmin/login/verify', {
        challenge: 'challenge-token',
        code: '123456',
      })
    );
    await waitFor(() => expect(localStorage.getItem(SUPERADMIN_TOKEN_KEY)).toBe('real-token'));
  });

  it('sends a recovery code as `recovery_code`, not as `code`', async () => {
    // Sent to the wrong field it would fail the emailed-code check and be spent for
    // nothing — a single-use code burned while the person is already locked out.
    const user = userEvent.setup();
    renderLogin();
    await submitPassword(user);

    await user.click(await screen.findByRole('button', { name: /Didn't get the email/ }));
    await user.type(screen.getByLabelText('Recovery code'), 'ABCDE-FGHJK');
    await user.click(screen.getByRole('button', { name: /Verify and sign in/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/superadmin/login/verify', {
        challenge: 'challenge-token',
        recovery_code: 'ABCDE-FGHJK',
      })
    );
  });

  it('does not offer the recovery path when no codes exist', async () => {
    post.mockImplementation((url) => {
      if (url === '/superadmin/login') {
        return Promise.resolve({ data: { ...CHALLENGE, recovery_available: false } });
      }
      return Promise.resolve({ data: {} });
    });
    const user = userEvent.setup();
    renderLogin();
    await submitPassword(user);

    await screen.findByLabelText('Sign-in code');
    expect(screen.queryByRole('button', { name: /Didn't get the email/ })).not.toBeInTheDocument();
  });

  it('keeps the browser from autofilling the emailed code into the recovery field', async () => {
    const user = userEvent.setup();
    renderLogin();
    await submitPassword(user);
    await user.click(await screen.findByRole('button', { name: /Didn't get the email/ }));

    expect(screen.getByLabelText('Recovery code')).toHaveAttribute('autocomplete', 'off');
  });

  it('a wrong code leaves you on step two rather than back at the password', async () => {
    const user = userEvent.setup();
    renderLogin();
    await submitPassword(user);

    post.mockImplementation(() =>
      Promise.reject({ response: { data: { message: 'That code is not valid or has expired.' } } })
    );
    await user.type(await screen.findByLabelText('Sign-in code'), '000000');
    await user.click(screen.getByRole('button', { name: /Verify and sign in/ }));

    expect(await screen.findByText(/not valid or has expired/)).toBeInTheDocument();
    expect(screen.getByLabelText('Sign-in code')).toBeInTheDocument();
    expect(localStorage.getItem(SUPERADMIN_TOKEN_KEY)).toBeNull();
  });

  it('"Start over" returns to the password step', async () => {
    const user = userEvent.setup();
    renderLogin();
    await submitPassword(user);

    await user.click(await screen.findByRole('button', { name: 'Start over' }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('clears the typed password once it has been accepted', async () => {
    // It has served its purpose; leaving it in component state is one more place it lives.
    const user = userEvent.setup();
    renderLogin();
    await submitPassword(user);
    await screen.findByLabelText('Sign-in code');

    await user.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });
});
