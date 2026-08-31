import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, LogIn, ChevronLeft, KeyRound, LifeBuoy } from 'lucide-react';

import BrandLogo from '../../components/layout/BrandLogo';
import ThemeToggle from '../../components/layout/ThemeToggle';
import Alert from '../../components/ui/Alert';
import { Button } from '@/components/shadcn/button';
import { Input, Label } from '@/components/shadcn/input';
import superAdminApi, { saveSuperAdminSession } from '../../services/superAdminApi';

/**
 * Sign-in for the management portal.
 *
 * Deliberately a separate door from /admin. The backend will not accept an ordinary admin
 * token on /api/superadmin/* even when it belongs to a super admin — the management surface
 * can create admins and move candidates between companies, so reaching it has to be a
 * deliberate act rather than something an already-open Admin Hub tab carries silently.
 */
const SuperAdminLoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Set once the password is accepted. Its presence is what switches this page to step two;
  // the challenge itself is NOT a session — it only proves the first factor passed, and the
  // server signs it with a different key so it cannot be used as one.
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await superAdminApi.post('/superadmin/login', {
        // Credentials pasted from a password manager routinely carry a trailing space,
        // which is the most common cause of a false "invalid credentials".
        email: email.trim(),
        password: password.trim(),
      });
      // No token here, by design — a correct password earns a code, not a session.
      setChallenge(res.data);
      setPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const entered = code.trim();
      const res = await superAdminApi.post('/superadmin/login/verify', {
        challenge: challenge.challenge,
        ...(useRecovery ? { recovery_code: entered } : { code: entered }),
      });
      saveSuperAdminSession(res.data.access_token, res.data.user);
      navigate('/superadmin', {
        replace: true,
        // Surfaced on arrival rather than here: burning a recovery code is a thing to
        // notice and act on, and this page is about to unmount.
        state: { recoveryCodesRemaining: useRecovery ? res.data.recovery_codes_remaining : null },
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not verify that code.');
    } finally {
      setLoading(false);
    }
  };

  const restart = () => {
    setChallenge(null);
    setCode('');
    setUseRecovery(false);
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="absolute right-5 top-5 flex items-center gap-2">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo />
          <span className="mt-6 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-7" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-foreground">
            Super Admin
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Companies, administrators, and who can see whom.
          </p>
        </div>

        {!challenge ? (
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
                <Label htmlFor="superadmin-email">Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="superadmin-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-10 pl-9"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="superadmin-password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="superadmin-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 pl-9"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                <LogIn className="size-4" />
                {loading ? 'Signing in…' : 'Continue'}
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={handleVerify}
            className="rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            {error && (
              <Alert variant="error" className="mb-4">
                {error}
              </Alert>
            )}

            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-foreground">
                  {useRecovery ? 'Use a recovery code' : 'Check your email'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {useRecovery ? (
                    'Enter one of the codes you saved. Each one works only once.'
                  ) : (
                    <>
                      We sent a code to <strong>{challenge.sent_to}</strong>. It expires in{' '}
                      {challenge.expires_in_minutes} minutes.
                    </>
                  )}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="superadmin-code">
                  {useRecovery ? 'Recovery code' : 'Sign-in code'}
                </Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="superadmin-code"
                    // Never "one-time-code" for the recovery field: the browser would offer
                    // the emailed code there, which would burn a recovery code against the
                    // wrong check and fail.
                    autoComplete={useRecovery ? 'off' : 'one-time-code'}
                    inputMode={useRecovery ? 'text' : 'numeric'}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={useRecovery ? 'XXXXX-XXXXX' : '123456'}
                    className="h-10 pl-9 tracking-widest"
                    autoFocus
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
                <ShieldCheck className="size-4" />
                {loading ? 'Checking…' : 'Verify and sign in'}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={restart}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Start over
                </button>
                {challenge.recovery_available && (
                  <button
                    type="button"
                    onClick={() => {
                      setUseRecovery((v) => !v);
                      setCode('');
                      setError('');
                    }}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <LifeBuoy className="size-3.5" />
                    {useRecovery ? 'Use the emailed code' : "Didn't get the email?"}
                  </button>
                )}
              </div>
            </div>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Back to the Admin Hub
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminLoginPage;
