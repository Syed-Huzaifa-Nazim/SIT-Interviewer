import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Sparkles, Mail, Lock, ShieldCheck, AlertCircle, CheckCircle } from 'lucide-react';

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
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 relative overflow-hidden">
      {/* Glow Spots */}
      <div className="glow-spot bg-primary-600 top-[-20%] left-[-10%]"></div>
      <div className="glow-spot bg-indigo-700 bottom-[-20%] right-[-10%]"></div>

      {/* Brand Logo */}
      <Link to="/" className="flex items-center gap-2 font-extrabold text-2xl tracking-tight text-white mb-8 relative z-10">
        <div className="p-1.5 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-lg">
          <Sparkles size={22} className="text-white" />
        </div>
        <span>Interviewer<span className="text-primary-500">.AI</span></span>
      </Link>

      {/* Card */}
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl relative z-10 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Reset Password</h2>
        <p className="text-slate-400 text-sm text-center mb-8">
          {step === 1 ? 'Enter your email to receive a reset code' : 'Verify reset code and configure new password'}
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-start gap-2.5">
            <CheckCircle size={16} className="shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {step === 1 ? (
          /* Step 1: Request Form */
          <form onSubmit={handleRequestOtp} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="email"
                  className="w-full glass-input pl-11"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-sm font-bold rounded-xl shadow-lg shadow-primary-600/30 transition disabled:opacity-50"
            >
              {loading ? 'Sending Code...' : 'Request Reset Code'}
            </button>
          </form>
        ) : (
          /* Step 2: Reset Form */
          <form onSubmit={handleResetPassword} className="space-y-4">
            {/* Show Debug Box */}
            {debugOtp && (
              <div className="p-3 bg-slate-900 border border-primary-500/30 rounded-xl text-center mb-4">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Developer Debug Reset Code</span>
                <span className="text-lg font-mono font-bold tracking-widest text-primary-400">{debugOtp}</span>
              </div>
            )}

            {/* OTP */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Verification Code</label>
              <div className="relative">
                <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  maxLength="6"
                  className="w-full glass-input pl-11 text-center font-mono tracking-widest"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password"
                  className="w-full glass-input pl-11"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-sm font-bold rounded-xl shadow-lg shadow-primary-600/30 transition disabled:opacity-50"
            >
              {loading ? 'Resetting Password...' : 'Verify & Set Password'}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-slate-500">
          Back to{' '}
          <Link to="/login" className="text-primary-400 hover:text-primary-300 hover:underline font-semibold font-sans">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
