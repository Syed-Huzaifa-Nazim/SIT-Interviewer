import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/layout/BrandLogo';
import ThemeToggle from '../components/layout/ThemeToggle';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { User, Mail, Lock, UserPlus, ChevronLeft, CheckCircle2 } from 'lucide-react';

const RegisterPage = () => {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [success, setSuccess] = useState(false);
  const { register, error, clearError } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setFormData({ ...formData, [e.target.id]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    clearError();

    if (formData.password !== formData.confirmPassword) {
      return setValidationError('Passwords do not match');
    }
    if (formData.password.length < 8) {
      return setValidationError('Password must be at least 8 characters long');
    }

    setLoading(true);
    try {
      const ok = await register({
        name: formData.name,
        email: formData.email,
        password: formData.password
      });
      if (ok) {
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
    <div className="min-h-screen flex flex-row-reverse bg-slate-50 dark:bg-slate-950 font-sans">
      
      {/* Right side: Branding / Info */}
      <div className="hidden lg:flex flex-col justify-center w-1/2 auth-aurora text-white p-16 relative overflow-hidden border-l border-slate-800">
         <div className="absolute top-0 right-0 w-64 h-64 bg-accent-500/20 rounded-full blur-3xl -z-10" />
         <div className="relative z-10 max-w-lg mx-auto">
          <BrandLogo className="!text-white mb-10" />
          <h1 className="text-4xl font-extrabold mb-6 leading-tight">Start Your Journey.</h1>
          <ul className="space-y-4 text-slate-300 font-medium">
             <li className="flex items-center gap-3"><span className="text-accent-500">✓</span> Practice with AI-driven roleplay</li>
             <li className="flex items-center gap-3"><span className="text-accent-500">✓</span> Code execution environments</li>
             <li className="flex items-center gap-3"><span className="text-accent-500">✓</span> Detailed feedback and metrics</li>
          </ul>
        </div>
      </div>

      {/* Left side: Register Form */}
      <div className="w-full lg:w-1/2 flex flex-col p-8 relative">
        {/* Success overlay (§10) */}
        {success && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
            <div className="w-20 h-20 rounded-full bg-accent-500/15 text-accent-500 flex items-center justify-center animate-check-pop">
              <CheckCircle2 size={48} />
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">Account created</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Setting up your dashboard…</p>
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
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">Enrollment</h2>
            <p className="text-sm text-slate-500 mt-2">Create your student profile</p>
          </div>

          {(error || validationError) && <Alert variant="error">{validationError || error}</Alert>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input id="name" type="text" label="Full Name" value={formData.name} onChange={handleChange} icon={User} placeholder="John Doe" required />
            <Input id="email" type="email" label="Email Address" value={formData.email} onChange={handleChange} icon={Mail} placeholder="john@example.com" required />
            <Input id="password" type="password" label="Password" value={formData.password} onChange={handleChange} icon={Lock} placeholder="••••••••" required />
            <Input id="confirmPassword" type="password" label="Confirm Password" value={formData.confirmPassword} onChange={handleChange} icon={Lock} placeholder="••••••••" required />

            <Button type="submit" fullWidth loading={loading} icon={UserPlus} className="mt-6">
              Create Profile
            </Button>
          </form>

          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Already enrolled?{' '}
            <Link to="/login" className="font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400 transition-colors">
              Sign in to Portal
            </Link>
          </p>
        </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;