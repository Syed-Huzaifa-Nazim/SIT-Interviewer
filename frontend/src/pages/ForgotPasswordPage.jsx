import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import GlowBackground from '../components/layout/GlowBackground';
import BrandLogo from '../components/layout/BrandLogo';
import ThemeToggle from '../components/layout/ThemeToggle';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { Mail, Lock, ShieldCheck, ChevronLeft } from 'lucide-react';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [step, setStep] = useState(1); // 1 = Request, 2 = Verify & Reset
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [debugOtp, setDebugOtp] = useState('');

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Please provide your email');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/forgot-password', { email });
      setSuccess('A reset code has been generated. Use the debug code below to reset.');
      setDebugOtp(res.data.debug_otp || '123456');
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!otp || !newPassword) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/auth/reset-password', { email, otp, new_password: newPassword });
      setSuccess('Password reset successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. Check your OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col justify-center items-center px-4 relative overflow-hidden">
      <GlowBackground variant="auth" />

      <div className="absolute top-5 left-5 right-5 z-20 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition">
          <ChevronLeft size={16} /> Back to Home
        </Link>
        <ThemeToggle />
      </div>

      <BrandLogo size="lg" className="mb-8 relative z-10" />

      <Card className="w-full max-w-md relative z-10 shadow-2xl animate-slide-up">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Reset Password</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            {step === 1 ? 'Enter your email to receive a reset code' : 'Verify reset code and configure new password'}
          </p>
        </div>

        {error && <Alert variant="error" className="mb-6 text-xs">{error}</Alert>}

        {success && <Alert variant="success" className="mb-6 text-xs">{success}</Alert>}

        {step === 1 ? (
          /* Step 1: Request Form */
          <form onSubmit={handleRequestOtp} className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              icon={Mail}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Button type="submit" loading={loading} fullWidth size="lg">
              {loading ? 'Sending Code...' : 'Request Reset Code'}
            </Button>
          </form>
        ) : (
          /* Step 2: Reset Form */
          <form onSubmit={handleResetPassword} className="space-y-4">
            {/* Show Debug Box */}
            {debugOtp && (
              <div className="p-3 bg-slate-100 dark:bg-slate-900 border border-primary-500/30 rounded-xl text-center mb-4">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Developer Debug Reset Code</span>
                <span className="text-lg font-mono font-bold tracking-widest text-primary-500 dark:text-primary-400">{debugOtp}</span>
              </div>
            )}

            <Input
              label="Verification Code"
              type="text"
              icon={ShieldCheck}
              maxLength="6"
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputClassName="text-center font-mono tracking-widest"
              required
            />

            <Input
              label="New Password"
              type="password"
              icon={Lock}
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />

            <Button type="submit" loading={loading} fullWidth size="lg">
              {loading ? 'Resetting Password...' : 'Verify & Set Password'}
            </Button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-slate-500">
          Back to{' '}
          <Link to="/login" className="text-primary-500 hover:text-primary-400 hover:underline font-semibold">
            Sign In
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
