import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GlowBackground from '../components/layout/GlowBackground';
import BrandLogo from '../components/layout/BrandLogo';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { User, Mail, Lock, Globe, Briefcase, ChevronRight } from 'lucide-react';

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
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      <GlowBackground variant="auth" />

      <BrandLogo size="lg" className="mb-8 relative z-10" />

      <Card className="w-full max-w-lg relative z-10 shadow-2xl animate-slide-up">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Create Your Account</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Get 5 free tokens instantly on registration</p>
        </div>

        {error && <Alert variant="error" className="mb-6 text-xs">{error}</Alert>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name *"
              type="text"
              icon={User}
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              inputClassName="text-sm"
              required
            />

            <Input
              label="Email Address *"
              type="email"
              icon={Mail}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputClassName="text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Password *"
              type="password"
              icon={Lock}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              inputClassName="text-sm"
              required
            />

            <Input
              label="Confirm Password *"
              type="password"
              icon={Lock}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              inputClassName="text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Country *"
              type="text"
              icon={Globe}
              placeholder="United Kingdom"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              inputClassName="text-sm"
              required
            />

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Experience Level *</label>
              <select
                className="w-full glass-input text-sm cursor-pointer"
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value)}
              >
                {experienceOptions.map((opt) => (
                  <option key={opt} value={opt} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {opt} Level
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Target Job Role *</label>
            <div className="relative">
              <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" size={18} />
              <input
                type="text"
                list="roles-list"
                className="w-full glass-input pl-11 text-sm"
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

          <Button
            type="submit"
            loading={loading}
            fullWidth
            size="lg"
            icon={ChevronRight}
            iconPosition="right"
            className="mt-4"
          >
            {loading ? 'Creating Account...' : 'Get Started Now'}
          </Button>
        </form>

        <p className="mt-8 text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-500 hover:text-primary-400 hover:underline font-semibold">
            Sign In
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default RegisterPage;
