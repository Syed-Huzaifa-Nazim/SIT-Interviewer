import React from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import Button from '../components/ui/Button';
import Reveal from '../components/ui/Reveal';
import NeuralHero from '../components/three/NeuralHero';
import {
  Mic, Code, FileText, TrendingUp, ShieldCheck,
  ArrowRight, Award, Play, Zap, Eye, Timer, X, Check, Building2,
} from 'lucide-react';

const FEATURES = [
  { title: 'Real-Time Adaptive Evaluation', desc: 'Every spoken and coded answer is judged on substance by an LLM against an ideal answer — not keyword matching, not a fixed rubric.', icon: Mic },
  { title: 'Domain-Intelligent Questioning', desc: 'Questions are generated for your actual category or a pasted job description, across four coding formats — scenario, logic, concept, and debugging.', icon: Code },
  { title: 'Integrity by Design', desc: 'Face, hand, and eye/gaze tracking plus full-screen enforcement run continuously in the background — never blocking your flow, always watching.', icon: ShieldCheck },
  { title: 'Instant Question Progression', desc: 'Answers are scored asynchronously in the background, so you move to the next question in milliseconds — the interview feels human-paced.', icon: Zap },
  { title: 'ATS Resume & JD Matching', desc: 'Upload a resume or paste a job description to extract skills, surface gaps, and generate questions tailored to that exact role.', icon: FileText },
  { title: 'Structured Scorecards', desc: 'A written rationale, technical/communication/confidence sub-scores, and a full transcript for every completed session.', icon: TrendingUp },
];

const OLD_VS_NEW = [
  { old: 'Keyword-matched scoring that rewards buzzwords over understanding', icon: X },
  { old: 'Generic question banks with no connection to the actual role', icon: X },
  { old: 'Unmonitored sessions — no way to trust the result was earned', icon: X },
  { old: 'Manual grading that takes days to turn into feedback', icon: X },
];

const NEW_WAY = [
  { text: 'An LLM reads meaning, not keywords — genuine understanding of what you actually said', icon: Check },
  { text: 'Questions generated for your domain or a pasted JD, across four distinct coding formats', icon: Check },
  { text: 'Continuous face, hand, and eye/gaze proctoring with one-time secure sessions', icon: Check },
  { text: 'Scoring runs in the background — your report is ready the moment the interview ends', icon: Check },
];

const LandingPage = () => (
  <PublicLayout>
    {/* Hero */}
    <header className="relative pt-16 pb-24 md:pb-32 overflow-hidden">
      <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900/50 -z-10" />
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-16 items-center">
        <div className="text-left space-y-6 lg:col-span-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-100 text-accent-800 dark:bg-accent-900/30 dark:text-accent-400 text-xs font-bold uppercase tracking-wide">
            <Award size={14} /> Built by Saylani for Real Readiness
          </div>
          <h1 className="text-4xl sm:text-5xl xl:text-6xl font-extrabold tracking-tight leading-tight text-balance text-slate-900 dark:text-white">
            Interviews that <span className="text-primary-600 dark:text-primary-400">actually understand</span> you.
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg">
            Most practice tools check for keywords. This one actually understands your answer —
            spoken or coded — the same way a real technical panel would, with live proctoring
            that makes the result something you can trust.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 pt-2">
            <Link to="/register" className="w-full sm:w-auto">
              <Button size="lg" icon={ArrowRight} iconPosition="right" className="w-full">Access Student Portal</Button>
            </Link>
            <Link to="/demo" className="w-full sm:w-auto">
              <Button variant="secondary" size="lg" icon={Play} className="w-full">Interactive Demo</Button>
            </Link>
          </div>
        </div>

        {/* Hero visual: Three.js neural-network scene, with a glass card floating on top */}
        <div className="relative w-full aspect-square max-w-md mx-auto lg:col-span-2 lg:max-w-none lg:ml-auto lg:aspect-[4/3]">
          <div className="absolute inset-0 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40">
            <NeuralHero />
          </div>
          <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto sm:w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/85 backdrop-blur-md p-5 shadow-xl">
            <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 mb-2">
              <Eye size={16} />
              <span className="text-[11px] font-bold uppercase tracking-widest">Live Right Now</span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              Every answer is being read for substance, not scanned for keywords.
            </p>
          </div>
        </div>
      </div>
    </header>

    {/* Problem / Solution */}
    <section className="py-20 md:py-24 bg-white dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">The Shift</span>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2 mb-4">
            Practice interviews were never built to actually evaluate you.
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            Most tools check whether you said the right words. This platform was built to check
            whether you understood the question.
          </p>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Reveal delay={60}>
            <div className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-8 space-y-4">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">The Old Way</span>
              <ul className="space-y-3">
                {OLD_VS_NEW.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.old} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
                      <span className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon size={12} />
                      </span>
                      <span>{item.old}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={140}>
            <div className="h-full rounded-2xl border border-primary-200 dark:border-primary-800/60 bg-primary-50/60 dark:bg-primary-950/20 p-8 space-y-4">
              <span className="text-[11px] font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">This Platform</span>
              <ul className="space-y-3">
                {NEW_WAY.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.text} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                      <span className="w-5 h-5 rounded-full bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon size={12} />
                      </span>
                      <span>{item.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>

    {/* Feature showcase */}
    <section className="py-20 md:py-24 bg-slate-50 dark:bg-slate-900/30 border-y border-slate-100 dark:border-slate-900">
      <div className="max-w-7xl mx-auto px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">Capabilities</span>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2 mb-4">An end-to-end interviewing system, not a single feature.</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">From signup and identity verification through the live interview to the final scorecard — every stage is built, not bolted on.</p>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((f, idx) => {
            const Icon = f.icon;
            return (
              <Reveal key={f.title} delay={idx * 60}>
                <div className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-8 group hover:-translate-y-1 hover:shadow-corporate-hover transition-all duration-300">
                  <div className="w-12 h-12 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-6 group-hover:bg-primary-600 group-hover:text-white transition-colors">
                    <Icon size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">{f.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
        <div className="mt-12 text-center">
          <Link to="/features" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 dark:text-primary-400 hover:gap-2.5 transition-all">
            Explore every capability in depth <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>

    {/* Speed callout */}
    <section className="py-16 bg-white dark:bg-slate-950">
      <div className="max-w-5xl mx-auto px-6">
        <Reveal>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-primary-50 to-accent-50/40 dark:from-primary-950/20 dark:to-accent-950/10 p-8 md:p-10 flex flex-col md:flex-row items-center gap-8">
            <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 shadow-corporate flex items-center justify-center shrink-0">
              <Timer className="text-primary-600 dark:text-primary-400" size={28} />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-2">No lag between questions.</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Scoring runs in the background the instant you finish speaking — you move to the
                next question immediately, and proctoring keeps watching in real time throughout.
                The result: an interview that feels paced like a real conversation, not a form.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>

    {/* Social proof — placeholder structure, clearly labeled */}
    <section className="py-20 bg-slate-50 dark:bg-slate-900/30 border-y border-slate-100 dark:border-slate-900">
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="text-center max-w-xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Track Record</span>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-2">
            Built for Saylani's students — results coming soon.
          </h2>
          <p className="text-slate-500 dark:text-slate-500 text-sm mt-3">
            This platform is actively rolling out. Cohort outcomes and partner placements will
            appear here as they come in.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {['Sessions Completed', 'Avg. Feedback Time', 'Proctoring Uptime', 'Partner Placements'].map((label) => (
              <div key={label} className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/30 p-6 text-center">
                <div className="flex items-center justify-center gap-1.5 text-slate-400 dark:text-slate-600 mb-2">
                  <Building2 size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wide">Coming Soon</span>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>

    {/* CTA band */}
    <section className="py-20 bg-white dark:bg-slate-950">
      <Reveal className="max-w-4xl mx-auto px-6 text-center space-y-6">
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">Ready to prove your readiness?</h2>
        <p className="text-slate-600 dark:text-slate-400">Start with 5 free interview tokens — no card required.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/register"><Button size="lg" icon={ArrowRight} iconPosition="right">Enroll Now</Button></Link>
          <Link to="/pricing"><Button variant="secondary" size="lg">View Pricing</Button></Link>
        </div>
      </Reveal>
    </section>
  </PublicLayout>
);

export default LandingPage;
