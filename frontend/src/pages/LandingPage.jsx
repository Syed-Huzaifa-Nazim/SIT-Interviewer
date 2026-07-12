import React from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import Button from '../components/ui/Button';
import {
  Mic, Code, FileText, TrendingUp, ShieldCheck, UserCheck,
  ArrowRight, Award, Play, Brain, Monitor,
} from 'lucide-react';

const FEATURE_PREVIEW = [
  { title: 'Voice-Driven Assessment', desc: 'Speak your answers; Whisper transcribes and the AI evaluates the substance.', icon: Mic },
  { title: 'Live Coding Environment', desc: 'Solve challenges and run real test cases in the browser sandbox.', icon: Code },
  { title: 'ATS Resume Parsing', desc: 'Extract skills and match your resume against target roles.', icon: FileText },
  { title: 'Contextual Questioning', desc: 'Paste a job description for tailored, role-specific questions.', icon: UserCheck },
  { title: 'Analytics & Scorecards', desc: 'A per-answer rationale, scores, and confidence in one report.', icon: TrendingUp },
  { title: 'Exam Integrity Module', desc: 'Gaze, hand-presence, and tab monitoring for proctored readiness.', icon: ShieldCheck },
];

const HERO_HEADLINE_SEGMENTS = [
  { text: 'Elevate Your ' },
  { text: 'Technical Interview', className: 'text-primary-600 dark:text-primary-400' },
  { text: ' Readiness.' },
];

// Types out `segments` character-by-character, preserving each segment's own className
// (so the highlighted phrase stays colored while it types) and exposes the full string
// to screen readers via the parent's aria-label instead of narrating partial text.
const TypewriterHeadline = ({ segments, speed = 100, startDelay = 0 }) => {
  const [count, setCount] = React.useState(0);
  const fullLength = segments.reduce((total, seg) => total + seg.text.length, 0);

  React.useEffect(() => {
    setCount(0);
    let typed = 0;
    let intervalId;
    const startId = setTimeout(() => {
      intervalId = setInterval(() => {
        typed += 1;
        setCount(typed);
        if (typed >= fullLength) clearInterval(intervalId);
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(startId);
      clearInterval(intervalId);
    };
  }, [fullLength, speed, startDelay]);

  let remaining = count;
  return (
    <>
      {segments.map((seg, idx) => {
        const shown = seg.text.slice(0, Math.max(0, Math.min(seg.text.length, remaining)));
        remaining -= seg.text.length;
        return shown ? (
          <span key={idx} className={seg.className}>{shown}</span>
        ) : null;
      })}
      <span
        aria-hidden="true"
        className="inline-block w-[3px] h-[0.85em] ml-0.5 -mb-1 bg-primary-600 dark:bg-primary-400 animate-pulse"
      />
    </>
  );
};

const LandingPage = () => (
  <PublicLayout>
    {/* Hero */}
    <header className="relative pt-16 pb-24 overflow-hidden">
      <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900/50 -z-10" />
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="text-left space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-100 text-accent-800 dark:bg-accent-900/30 dark:text-accent-400 text-xs font-bold uppercase tracking-wide">
            <Award size={14} /> Official Pre-Assessment Portal
          </div>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight text-slate-900 dark:text-white"
            aria-label="Elevate Your Technical Interview Readiness."
          >
            <span aria-hidden="true">
              <TypewriterHeadline segments={HERO_HEADLINE_SEGMENTS} />
            </span>
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg">
            Simulate enterprise-grade technical and behavioral assessments. Practice with voice responses, execute code in sandboxes, and receive immediate AI-generated feedback reports.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <Link to="/register" className="w-full sm:w-auto bg-primary-600 hover:bg-primary-700 text-white px-8 py-3.5 rounded-lg text-sm font-semibold shadow-corporate flex items-center justify-center gap-2 group transition-all">
              <span>Access Student Portal</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/demo" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" icon={Play} className="w-full">Interactive Demo</Button>
            </Link>
          </div>
        </div>

        {/* Hero visual */}
        <div className="relative z-10 w-full max-w-md mx-auto lg:max-w-none lg:ml-auto">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-50 rounded-full blur-3xl -z-10 dark:bg-primary-900/20" />
            <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 border-b border-slate-200 dark:border-slate-800 pb-4 mb-6">
              <Monitor size={18} />
              <span className="text-sm font-bold uppercase tracking-widest">Live Evaluator</span>
            </div>
            <div className="py-6 text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mx-auto flex items-center justify-center">
                <Brain size={32} />
              </div>
              <div>
                <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Real-Time Evaluation</h4>
                <p className="text-sm text-slate-500 max-w-xs mx-auto">
                  Answers are scored on substance — correctness, completeness, clarity — with a written rationale for every response.
                </p>
              </div>
              <Link to="/demo">
                <Button className="px-8" icon={Play}>Try the Demo</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>

    {/* Feature preview */}
    <section className="py-24 bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">Core Academic Modules</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">Engineered to map accurately with modern development requirements and testing rigor.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURE_PREVIEW.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-8 group hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-6 group-hover:bg-primary-600 group-hover:text-white transition-colors">
                  <Icon size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">{f.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-12 text-center">
          <Link to="/features" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:gap-2.5 transition-all">
            Explore all features <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>

    {/* CTA band */}
    <section className="py-20 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-900">
      <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">Ready to prove your readiness?</h2>
        <p className="text-slate-600 dark:text-slate-400">Start with 5 free interview tokens — no card required.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/register"><Button size="lg" icon={ArrowRight} iconPosition="right">Enroll Now</Button></Link>
          <Link to="/pricing"><Button variant="secondary" size="lg">View Pricing</Button></Link>
        </div>
      </div>
    </section>
  </PublicLayout>
);

export default LandingPage;
