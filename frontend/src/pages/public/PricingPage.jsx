import React from 'react';
import { Link } from 'react-router-dom';
import PublicLayout from '../../layouts/PublicLayout';
import PageHero from './PageHero';
import Card from '../../components/ui/Card';
import Reveal from '../../components/ui/Reveal';
import Button from '../../components/ui/Button';
import { Check } from 'lucide-react';

const TIERS = [
  {
    name: 'Free Trial', price: '$0', period: 'forever',
    desc: 'Access standard features for individual study.',
    features: ['5 Free mock interview tokens', 'Basic scorecard reports', 'Whisper voice transcription', 'Standard proctoring mode'],
    action: 'Get Started', to: '/register', popular: false,
  },
  {
    name: 'Bootcamp Pack', price: '$19', period: 'one-time purchase',
    desc: 'Best for candidates in active job hunts.',
    features: ['25 Interview tokens', 'Tailored Job Description matching', 'AI Coach Recommendations', 'Unlimited resume analysis', 'Direct PDF scorecard exports'],
    action: 'Purchase Plan', to: '/register', popular: true,
  },
  {
    name: 'Institutional Pro', price: '$49', period: 'per candidate / batch',
    desc: 'Tailored for technical training schools.',
    features: ['100 Assessment tokens', 'Advanced proctor violation evidence', 'Webcam capture storage audits', 'Admin statistics & oversight', 'Priority support channels'],
    action: 'Contact Sales', to: '/contact', popular: false,
  },
];

const PricingPage = () => (
  <PublicLayout>
    <PageHero
      eyebrow="Student Pricing"
      title="Transparent Student Pricing"
      subtitle="Choose the assessment limits that match your professional training schedule."
    />
    <section className="max-w-7xl mx-auto px-6 py-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {TIERS.map((tier, idx) => (
          <Reveal key={tier.name} delay={idx * 80}>
            <Card
              className={`h-full p-6 flex flex-col justify-between relative overflow-hidden ${
                tier.popular ? 'border-2 border-primary-500 shadow-lg' : 'border border-slate-200 dark:border-slate-800'
              }`}
            >
              {tier.popular && (
                <span className="absolute top-3 right-3 bg-primary-600 text-white font-bold text-[9px] uppercase px-2 py-0.5 rounded-full">
                  Most Popular
                </span>
              )}
              <div className="space-y-4">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">{tier.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-normal">{tier.desc}</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-900 dark:text-white">{tier.price}</span>
                  <span className="text-[11px] text-slate-400 font-semibold">/ {tier.period}</span>
                </div>
                <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check size={14} className="text-primary-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-6">
                <Link to={tier.to}>
                  <Button variant={tier.popular ? 'primary' : 'secondary'} fullWidth>{tier.action}</Button>
                </Link>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  </PublicLayout>
);

export default PricingPage;
