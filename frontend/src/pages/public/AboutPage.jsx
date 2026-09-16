import React from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../../layouts/PublicLayout';
import PageHero from './PageHero';
import Reveal from '../../components/ui/Reveal';
import Button from '../../components/ui/Button';
import {
  Target, Sparkles, ShieldCheck, GraduationCap, ArrowRight, Quote,
} from 'lucide-react';

const PRINCIPLES = [
  {
    icon: Sparkles,
    title: 'Understanding over keyword matching',
    body: 'A real interviewer doesn\'t grade you on whether you said "reconciliation"; they grade you on whether you understood React\'s rendering model. Our evaluator reads for that same substance, using an LLM that compares your actual answer against an ideal one, not a keyword list.',
  },
  {
    icon: Target,
    title: 'Relevant to you, specifically',
    body: 'Generic question banks test whether you memorized a FAQ. We generate questions from your course category or a pasted job description, across scenario, logic, conceptual, and debugging formats, so what you practice actually resembles the role you\'re preparing for.',
  },
  {
    icon: ShieldCheck,
    title: 'A result you can trust',
    body: 'Face, hand, and eye/gaze monitoring run continuously and quietly in the background, with one-time secure sessions for official attempts. The goal isn\'t to police you but to make sure the scorecard actually reflects your own work.',
  },
  {
    icon: GraduationCap,
    title: 'Built for Saylani\'s students, end to end',
    body: 'From CNIC-based signup through the live interview, coding assessment, and instructor review, this is one connected system built specifically for SMIT\'s programs, not a generic tool with our logo on it.',
  },
];

const AboutPage = () => (
  <PublicLayout>
    <PageHero
      eyebrow="About This Platform"
      title="We didn't set out to build another interview app."
      subtitle="We set out to fix what was broken about practicing for one."
    />

    <section className="max-w-4xl mx-auto px-6 py-20 space-y-6">
      <Reveal>
        <div className="flex gap-4 items-start">
          <Quote className="text-primary-300 dark:text-primary-800 shrink-0 mt-1" size={32} />
          <p className="text-lg sm:text-xl text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            Most "AI interview" tools are a script reading questions off a list and a keyword
            scanner pretending to be a grader. That gets you comfortable talking, but it doesn't
            get you ready for a real technical panel that's actually listening.
          </p>
        </div>
      </Reveal>
      <Reveal delay={80}>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          Saylani built this platform to close that gap for its own students: an interviewer
          that genuinely evaluates what you say and code, asks questions relevant to the role
          you're actually preparing for, and proctors the session closely enough that the
          scorecard means something, end to end, from signup to final report.
        </p>
      </Reveal>
    </section>

    <section className="py-20 bg-slate-50 dark:bg-slate-900/30 border-y border-slate-100 dark:border-slate-900">
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">What We Believe</span>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">The principles behind every feature we've built.</h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {PRINCIPLES.map((p, idx) => {
            const Icon = p.icon;
            return (
              <Reveal key={p.title} delay={idx * 70}>
                <div className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-8">
                  <div className="w-12 h-12 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center mb-5">
                    <Icon size={22} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">{p.title}</h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{p.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>

    <section className="py-20 bg-white dark:bg-slate-950">
      <Reveal className="max-w-3xl mx-auto px-6 text-center space-y-6">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
          See what an interview that actually listens feels like.
        </h2>
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
          <Link to="/demo"><Button size="lg" icon={ArrowRight} iconPosition="right">Try the Demo</Button></Link>
          <Link to="/features"><Button variant="secondary" size="lg">Explore Features</Button></Link>
        </div>
      </Reveal>
    </section>
  </PublicLayout>
);

export default AboutPage;
