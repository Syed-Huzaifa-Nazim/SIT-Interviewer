import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import BrandLogo from '../components/layout/BrandLogo';
import ThemeToggle from '../components/layout/ThemeToggle';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import {
  SIGNUP_CATEGORIES, COURSE_STATUS_OPTIONS, isInstructorCategory, formatCnic
} from '../utils/constants';
import {
  User, Mail, Lock, UserPlus, ChevronLeft, CheckCircle2,
  CreditCard, MailCheck, Hourglass, GraduationCap
} from 'lucide-react';

const CNIC_REGEX = /^\d{5}-?\d{7}-?\d$/;

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    cnic: '',
    course_category: '',
    course_status: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  // 'dashboard' | 'check_email' | 'reinterview' | null
  const [outcome, setOutcome] = useState(null);
  const [outcomeMessage, setOutcomeMessage] = useState('');
  // Backend-driven signup options (Update §1): a single flag controls the
  // "Ongoing → Coming Soon" state without a frontend redeploy.
  const [categories, setCategories] = useState(SIGNUP_CATEGORIES);
  const [ongoingEnabled, setOngoingEnabled] = useState(false);
  const { register, error, clearError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Clear any auth error left over from another page (e.g. a failed login) so a
    // warning only ever shows on the page where it actually happened.
    clearError();
    api.get('/auth/signup-options')
      .then((res) => {
        if (Array.isArray(res.data.categories)) setCategories(res.data.categories);
        setOngoingEnabled(!!res.data.ongoing_enabled);
      })
      .catch(() => { /* keep sensible defaults (Ongoing disabled) if the call fails */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isInstructor = isInstructorCategory(formData.course_category);
  const isCompleted = formData.course_status === 'completed';
  // Instructor and Completed-course both use the one-time-OTP flow (no signup password).
  const isOneTime = isInstructor || isCompleted;

  const handleChange = (e) => setFormData({ ...formData, [e.target.id]: e.target.value });

  // CNIC gets its own handler so digits-only input is auto-formatted with dashes.
  const handleCnicChange = (e) =>
    setFormData({ ...formData, cnic: formatCnic(e.target.value) });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    clearError();

    // Only Gmail addresses are accepted for enrollment — other providers
    // (Outlook, Yahoo, etc.) are rejected before the request is sent.
    if (!/^[^\s@]+@gmail\.com$/i.test(formData.email.trim())) {
      return setValidationError('Please enter a valid @gmail.com email address. Other providers (e.g. Outlook) are not accepted.');
    }
    if (!CNIC_REGEX.test(formData.cnic.trim())) {
      return setValidationError('Please enter a valid CNIC number (13 digits, e.g. 42101-1234567-1)');
    }
    if (!formData.course_category) {
      return setValidationError('Please select your category');
    }
    if (!isInstructor && !formData.course_status) {
      return setValidationError('Please select your course status');
    }
    if (!isInstructor && formData.course_status === 'ongoing' && !ongoingEnabled) {
      return setValidationError("The 'Ongoing' option is coming soon and cannot be selected yet.");
    }
    if (!isOneTime) {
      if (formData.password !== formData.confirmPassword) {
        return setValidationError('Passwords do not match');
      }
      if (formData.password.length < 8) {
        return setValidationError('Password must be at least 8 characters long');
      }
    }

    setLoading(true);
    try {
      const res = await register({
        name: formData.name,
        email: formData.email,
        cnic: formData.cnic.trim(),
        course_category: formData.course_category,
        // Instructor signups carry no course status.
        course_status: isInstructor ? undefined : formData.course_status,
        password: isOneTime ? undefined : formData.password,
      });

      if (res?.status === 'completed_pending_login' || res?.status === 'instructor_pending_login') {
        setOutcome('check_email');
      } else if (res?.status === 'reinterview_pending') {
        setOutcome('reinterview');
        setOutcomeMessage(res.message || '');
      } else if (res?.access_token) {
        setOutcome('dashboard');
        setTimeout(() => navigate('/dashboard'), 1200);
      }
    } catch (err) {
      // error state is surfaced via AuthContext
    } finally {
      setLoading(false);
    }
  };

  const selectClass =
    'w-full glass-input text-sm appearance-none cursor-pointer';

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
             <li className="flex items-center gap-3"><span className="text-accent-500">✓</span> Official proctored interviews</li>
             <li className="flex items-center gap-3"><span className="text-accent-500">✓</span> Detailed feedback and metrics</li>
          </ul>
        </div>
      </div>

      {/* Left side: Register Form */}
      <div className="w-full lg:w-1/2 flex flex-col p-8 relative animate-fade-in">
        {/* Ongoing signup success overlay */}
        {outcome === 'dashboard' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
            <div className="w-20 h-20 rounded-full bg-accent-500/15 text-accent-500 flex items-center justify-center animate-check-pop">
              <CheckCircle2 size={48} />
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">Account created</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-xs">
              Your login credentials have also been emailed to you. Setting up your dashboard…
            </p>
          </div>
        )}

        {/* Completed-course signup: credentials sent by email */}
        {outcome === 'check_email' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm p-8">
            <div className="w-20 h-20 rounded-full bg-primary-500/15 text-primary-500 flex items-center justify-center animate-check-pop">
              <MailCheck size={44} />
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">Check your email</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm leading-relaxed">
              We've sent your username (your CNIC) and a <b>one-time password</b> to your email address.
              The password works exactly once — log in only when you are ready to take your official interview.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-sm">
              Can't find the email? Please check your Spam or Junk folder.
            </p>
            <Button onClick={() => navigate('/login')} className="mt-2">Go to Login</Button>
          </div>
        )}

        {/* Second-interview request queued for admin approval */}
        {outcome === 'reinterview' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm p-8">
            <div className="w-20 h-20 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center animate-check-pop">
              <Hourglass size={44} />
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">Request sent for approval</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-sm leading-relaxed">
              {outcomeMessage ||
                'You have already completed an interview. Your request for a second attempt has been sent to the administrator — you will receive an email with the decision.'}
            </p>
            <Button variant="secondary" onClick={() => navigate('/')} className="mt-2">Back to Home</Button>
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

            <div className="space-y-1">
              <Input id="email" type="email" label="Email Address" value={formData.email} onChange={handleChange} icon={Mail} placeholder="john@example.com" required />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug px-1">
                Only invited @gmail.com accounts have access. Other providers (e.g. Outlook) are not accepted.
              </p>
            </div>

            <div className="space-y-1">
              <Input id="cnic" type="text" inputMode="numeric" maxLength={15} label="CNIC Number" value={formData.cnic} onChange={handleCnicChange} icon={CreditCard} placeholder="42101-1234567-1" required />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug px-1">
                You'll use this CNIC to log in.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="course_category" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Category</label>
              <select id="course_category" value={formData.course_category} onChange={handleChange} className={selectClass} required>
                <option value="" disabled>Select your category…</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Course status applies only to course candidates, not Instructors (Update §2). */}
            {!isInstructor && (
              <div className="space-y-1.5">
                <label htmlFor="course_status" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Course Status</label>
                <select id="course_status" value={formData.course_status} onChange={handleChange} className={selectClass} required>
                  <option value="" disabled>Select your course status…</option>
                  {COURSE_STATUS_OPTIONS.map((opt) => {
                    // "Ongoing" is temporarily disabled → shown as "Coming Soon" (Update §1).
                    const comingSoon = opt.value === 'ongoing' && !ongoingEnabled;
                    return (
                      <option key={opt.value} value={opt.value} disabled={comingSoon}>
                        {opt.label}{comingSoon ? ' — Coming Soon' : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">
                  This can only be set once. After signup, only the administration can change it.
                </p>
              </div>
            )}

            {isInstructor ? (
              <div className="p-3.5 bg-primary-500/5 border border-primary-500/20 rounded-xl text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex gap-2.5">
                <GraduationCap size={16} className="text-primary-500 shrink-0 mt-0.5" />
                <span>
                  <b className="text-primary-600 dark:text-primary-400">Instructor signup:</b> no course status or password needed.
                  After signup we'll email you a <b>one-time password</b> for your instructor interview.
                </span>
              </div>
            ) : isCompleted ? (
              <div className="p-3.5 bg-primary-500/5 border border-primary-500/20 rounded-xl text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <b className="text-primary-600 dark:text-primary-400">Certified candidate:</b> no password needed.
                After signup we'll email you a <b>one-time password</b> for your official proctored interview.
              </div>
            ) : (
              <>
                <Input id="password" type="password" label="Password" value={formData.password} onChange={handleChange} icon={Lock} placeholder="••••••••" required />
                <Input id="confirmPassword" type="password" label="Confirm Password" value={formData.confirmPassword} onChange={handleChange} icon={Lock} placeholder="••••••••" required />
              </>
            )}

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
