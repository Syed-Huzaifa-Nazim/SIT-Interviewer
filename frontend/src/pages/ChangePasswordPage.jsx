import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck } from 'lucide-react';

import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/ui/Alert';
import BrandLogo from '../components/layout/BrandLogo';
import ThemeToggle from '../components/layout/ThemeToggle';
import { Button } from '@/components/shadcn/button';
import { Input, Label } from '@/components/shadcn/input';

// Matches the admin minimum in backend/app/routes/auth_routes.py. Checked here only so the
// message arrives before the round trip; the backend is what enforces it.
const MIN_LENGTH = 12;

/**
 * Shown instead of the Admin Hub to an account still on its generated password.
 *
 * The account cannot reach anything else — the backend refuses the whole admin surface
 * until this is done — so this is not a prompt that can be dismissed or deferred. An
 * emailed password that is never replaced is a credential sitting in an inbox, readable by
 * anyone who ever gains access to that mailbox, for as long as the account exists.
 *
 * Changing it revokes every session including this one, so it ends by signing out. That is
 * the point rather than a rough edge: a password is replaced because the old one may be
 * known, and leaving sessions opened with it alive would change nothing for whoever has it.
 */
const ChangePasswordPage = () => {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== newPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setDone(true);
      // A moment to read what happened before the page is replaced by the sign-in screen.
      setTimeout(() => logout(), 1800);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not change the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo />
          <span className="mt-6 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-7" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground">
            Choose your password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account was created with a password that was emailed to you. Replace it
            before using the portal.
          </p>
        </div>

        {done ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500">
              <ShieldCheck className="size-6" />
            </span>
            <h2 className="mt-3 text-base font-bold text-foreground">Password changed</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every session opened with the old password has ended, including this one.
              Signing you out…
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            {error && (
              <Alert variant="error" className="mb-4">
                {error}
              </Alert>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">The password you were emailed</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="h-10 pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={`At least ${MIN_LENGTH} characters`}
                  aria-invalid={tooShort || undefined}
                  className="h-10"
                  required
                />
                {tooShort && (
                  <p className="text-xs text-destructive">
                    At least {MIN_LENGTH} characters — this account can read every candidate
                    in its companies.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={mismatch || undefined}
                  className="h-10"
                  required
                />
                {mismatch && (
                  <p className="text-xs text-destructive">These do not match.</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || tooShort || mismatch || !currentPassword}
              >
                {loading ? 'Saving…' : 'Set my password'}
              </Button>

              <p className="text-xs text-muted-foreground">
                You will be signed out and will need to sign in again with the new password.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordPage;
