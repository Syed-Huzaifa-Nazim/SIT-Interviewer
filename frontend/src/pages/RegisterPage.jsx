import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sparkles, User, Mail, Lock, Globe, Briefcase, ChevronRight, AlertCircle } from 'lucide-react';

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [country, setCountry] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('Mid');
  const [jobRole, setJobRole] = useState('React Developer');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validations
    if (!name || !email || !password || !confirmPassword || !country || !jobRole) {
      setError('Please fill in all required fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);

    try {
      await register(name, email, password, country, experienceLevel, jobRole);
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const experienceOptions = ['Entry', 'Mid', 'Senior'];
  const popularRoles = [
    'AI Engineer',
    'Machine Learning Engineer',
    'React Developer',
    'Node.js Developer',
    'Full Stack Engineer',
    'Python Developer',
    'Java Developer',
    'Data Scientist',
    'DevOps Engineer',
    'Product Manager'
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
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

      {/* Signup Card */}
      <div className="w-full max-w-lg glass-panel p-8 rounded-2xl relative z-10 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Create Your Account</h2>
        <p className="text-slate-400 text-sm text-center mb-8">Get 5 free tokens instantly on registration</p>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-start gap-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Full Name *</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="text"
                  className="w-full glass-input pl-10 text-sm"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Email Address *</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="email"
                  className="w-full glass-input pl-10 text-sm"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Password *</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="password"
                  className="w-full glass-input pl-10 text-sm"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Confirm Password *</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="password"
                  className="w-full glass-input pl-10 text-sm"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Country */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Country *</label>
              <div className="relative">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  type="text"
                  className="w-full glass-input pl-10 text-sm"
                  placeholder="United Kingdom"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Experience Level */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Experience Level *</label>
              <select
                className="w-full glass-input text-sm cursor-pointer"
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
              >
                {experienceOptions.map((opt) => (
                  <option key={opt} value={opt} className="bg-slate-900 text-slate-100">
                    {opt} Level
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Job Role */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Target Job Role *</label>
            <div className="relative">
              <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                list="roles-list"
                className="w-full glass-input pl-10 text-sm"
                placeholder="React Developer"
                value={jobRole}
                onChange={(e) => setJobRole(e.target.value)}
                required
              />
              <datalist id="roles-list">
                {popularRoles.map((role) => (
                  <option key={role} value={role} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-sm font-bold rounded-xl shadow-lg shadow-primary-600/30 flex items-center justify-center gap-1.5 transition disabled:opacity-50 mt-4"
          >
            {loading ? 'Creating Account...' : 'Get Started Now'}
            <ChevronRight size={16} />
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-400 hover:text-primary-300 hover:underline font-semibold font-sans">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
