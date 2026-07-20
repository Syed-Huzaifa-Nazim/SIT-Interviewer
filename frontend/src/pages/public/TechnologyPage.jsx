import React from 'react';
import PublicLayout from '../../layouts/PublicLayout';
import PageHero from './PageHero';
import Card from '../../components/ui/Card';
import Reveal from '../../components/ui/Reveal';
import {
  ShieldCheck, Monitor, Sparkles, Shield, Brain, Mic, FileText, UserCheck, Zap,
} from 'lucide-react';

const STACK = [
  { name: 'FastAPI Core', desc: 'Asynchronous Python API', icon: ShieldCheck, color: 'text-emerald-500 bg-emerald-500/10' },
  { name: 'React 19 & Vite', desc: 'High-performance UI layer', icon: Monitor, color: 'text-primary-500 bg-primary-500/10' },
  { name: 'Tailwind CSS v4', desc: 'Modern styling system', icon: Sparkles, color: 'text-pink-500 bg-pink-500/10' },
  { name: 'SQL Database', desc: 'Secure persistent storage', icon: Shield, color: 'text-blue-500 bg-blue-500/10' },
  { name: 'LLM Evaluation', desc: 'Substance-based answer scoring', icon: Brain, color: 'text-violet-500 bg-violet-500/10' },
  { name: 'Whisper STT', desc: 'Voice-to-text transcription', icon: Mic, color: 'text-amber-500 bg-amber-500/10' },
  { name: 'Media Storage', desc: 'Secure audio & media blobs', icon: FileText, color: 'text-cyan-500 bg-cyan-500/10' },
  { name: 'Proctor Monitor', desc: 'Face, hand & eye/gaze analytics', icon: UserCheck, color: 'text-red-500 bg-red-500/10' },
  { name: 'Async Scoring Engine', desc: 'Background evaluation for instant progression', icon: Zap, color: 'text-orange-500 bg-orange-500/10' },
];

const TechnologyPage = () => (
  <PublicLayout>
    <PageHero
      eyebrow="Technology Stack"
      title="Advanced Technology Stack"
      subtitle="Built with modern, scalable, and secure technologies to deliver credible real-time evaluations."
    />
    <section className="max-w-7xl mx-auto px-6 py-20">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {STACK.map((tech, idx) => {
          const Icon = tech.icon;
          return (
            <Reveal key={tech.name} delay={idx * 40}>
              <Card hover className="p-5 flex flex-col justify-between border border-slate-200/60 dark:border-slate-800/80 h-full">
                <div className={`w-10 h-10 rounded-lg ${tech.color} flex items-center justify-center mb-4`}>
                  <Icon size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">{tech.name}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{tech.desc}</p>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </section>
  </PublicLayout>
);

export default TechnologyPage;
