import React from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../../layouts/PublicLayout';
import PageHero from './PageHero';
import Reveal from '../../components/ui/Reveal';
import Button from '../../components/ui/Button';
import {
  Mic, Code, FileText, TrendingUp, ShieldCheck, UserCheck, ArrowRight, Eye, Zap,
} from 'lucide-react';

const FEATURES = [
  { title: 'Voice-Driven Assessment', icon: Mic,
    desc: 'Practice verbal delivery. Our integrated Whisper engine transcribes your voice replies in real time, and an LLM evaluates the substance of what you say — not keywords.' },
  { title: 'Four Coding Question Formats', icon: Code,
    desc: 'Scenario-based problems, logic/approach explanations, direct conceptual questions, and debugging challenges — each routed to the evaluator that judges it correctly.' },
  { title: 'ATS Resume Parsing', icon: FileText,
    desc: 'Upload a PDF resume to extract skills, evaluate compatibility against target roles, and identify missing keywords.' },
  { title: 'Contextual Questioning', icon: UserCheck,
    desc: 'Paste any target job description. The AI instantly generates tailored, role-specific questions matching real-world expectations.' },
  { title: 'Analytics & Scorecards', icon: TrendingUp,
    desc: 'Review technical accuracy, verbal confidence, clarity, and a rationale for every answer in a single structured report.' },
  { title: 'Exam Integrity Module', icon: ShieldCheck,
    desc: 'Face-mesh gaze tracking, eye/gaze direction, hand-presence checks, and tab monitors detect distractions, building readiness for real proctored hiring tests.' },
  { title: 'Eye & Gaze Tracking', icon: Eye,
    desc: 'Continuous, soft-warning monitoring of where you\'re looking — catching sustained reading from notes or a second screen without ever auto-failing you for a natural glance away.' },
  { title: 'Instant Question Progression', icon: Zap,
    desc: 'Answers are scored asynchronously in the background the moment you submit, so the next question appears immediately — no waiting on the AI mid-interview.' },
];

const FeaturesPage = () => (
  <PublicLayout>
    <PageHero
      eyebrow="Program Features"
      title="Core Academic Modules"
      subtitle="Engineered to map accurately with modern development requirements and testing rigor."
    />
    <section className="max-w-7xl mx-auto px-6 py-20">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {FEATURES.map((f, idx) => {
          const Icon = f.icon;
          return (
            <Reveal key={f.title} delay={idx * 50}>
              <div className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-8 group hover:-translate-y-1 transition-all duration-300">
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

      <div className="mt-16 text-center">
        <Link to="/register">
          <Button size="lg" icon={ArrowRight} iconPosition="right">Start Practising Free</Button>
        </Link>
      </div>
    </section>
  </PublicLayout>
);

export default FeaturesPage;
