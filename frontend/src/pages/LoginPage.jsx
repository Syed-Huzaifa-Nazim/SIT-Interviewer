import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/layout/BrandLogo';
import ThemeToggle from '../components/layout/ThemeToggle';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { Mail, Lock, LogIn, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { formatCnic } from '../utils/constants';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { login, error } = useAuth();
  const navigate = useNavigate();

  // This field accepts EITHER an email or a CNIC. If the user is typing something
  // that looks like a CNIC (only digits and dashes), auto-format it with dashes;
  // otherwise it's an email, so leave it exactly as typed.
  const handleIdentifierChange = (e) => {
    const val = e.target.value;
    setEmail(/^[\d-]*$/.test(val) ? formatCnic(val) : val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login({ email, password });
      if (res) {
        // One-time (completed-course) candidates go straight to the proctored
        // interview gate — they have no dashboard (§3.3).
        if (res.one_time || res.user?.must_use_otp) {
          navigate('/interview/official', { replace: true });
          return;
        }
        // Brief success animation before redirecting (§10).
        setSuccess(true);
        setTimeout(() => navigate('/dashboard'), 1000);
      }
    } catch (err) {
      // error state is surfaced via AuthContext
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 font-sans">
      {/* Left side: Branding / Info */}
      <div className="hidden lg:flex flex-col justify-center w-1/2 auth-aurora text-white p-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="relative z-10 max-w-lg mx-auto">
          <BrandLogo className="!text-white mb-10" />
          <h1 className="text-4xl font-extrabold mb-6 leading-tight">Assessment Portal</h1>
          <p className="text-primary-200 text-lg leading-relaxed mb-8">
            Access your AI-powered interview simulators, review past evaluations, and refine your technical skills in a proctored environment.
          </p>
          <div className="bg-primary-800/50 rounded-xl p-6 border border-primary-700">
            <p className="text-sm font-medium italic">"SIT bridges the gap between learning and industry readiness through rigorous evaluation."</p>
          </div>
        </div>
      </div>

      {/* Right side: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col p-8 relative">
        {/* Success overlay (§10) */}
        {success && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
            <div className="w-20 h-20 rounded-full bg-accent-500/15 text-accent-500 flex items-center justify-center animate-check-pop">
              <CheckCircle2 size={48} />
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">Signed in successfully</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Taking you to your dashboard…</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition">
            <ChevronLeft size={16} /> Back to Home
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md space-y-8 stagger">

          <div className="lg:hidden text-center mb-8">
            <BrandLogo className="justify-center" />
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">Welcome Back</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Sign in to continue your evaluations</p>
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              id="email"
              type="text"
              label="Email Address or CNIC Number"
              value={email}
              onChange={handleIdentifierChange}
              icon={Mail}
              placeholder="email@example.com or 42101-1234567-1"
              maxLength={254}
              required
            />
            
            <div className="space-y-1">
              <Input
                id="password"
                type="password"
                label="Account Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={Lock}
                placeholder="••••••••"
                required
              />
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400 transition-colors">
                  Forgot Password?
                </Link>
              </div>
            </div>

            <Button type="submit" fullWidth loading={loading} icon={LogIn} className="mt-4">
              Access Portal
            </Button>
          </form>

          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Not enrolled yet?{' '}
            <Link to="/register" className="font-bold text-accent-600 hover:text-accent-700 dark:text-accent-500 transition-colors">
              Create an account
            </Link>
          </p>
        </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;