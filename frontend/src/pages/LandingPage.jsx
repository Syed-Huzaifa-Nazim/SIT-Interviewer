import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Sparkles, 
  Mic, 
  Code, 
  FileText, 
  TrendingUp, 
  ShieldCheck, 
  ChevronDown, 
  ArrowRight,
  UserCheck,
  Brain
} from 'lucide-react';

const LandingPage = () => {
  const [activeFaq, setActiveFaq] = useState(null);

  const features = [
    {
      title: 'Speech-to-Text Voice Sessions',
      desc: 'Practice speaking naturally. Our integrated Whisper service transcribes your voice replies in real time.',
      icon: Mic,
      color: 'from-violet-500 to-fuchsia-500'
    },
    {
      title: 'Interactive Coding Workspace',
      desc: 'Complete challenges in our live editor. Run script evaluations and receive structural complexity reviews.',
      icon: Code,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      title: 'ATS Resume gap analysis',
      desc: 'Upload your PDF resume to extract skills, calculate matches against job roles, and pinpoint missing criteria.',
      icon: FileText,
      color: 'from-emerald-500 to-teal-500'
    },
    {
      title: 'Custom Job matching',
      desc: 'Paste any job description to match skills and receive custom, dynamically-generated questions.',
      icon: UserCheck,
      color: 'from-amber-500 to-orange-500'
    },
    {
      title: 'Deep Performance Analytics',
      desc: 'Track metrics like technical depth, verbal confidence, vocabulary ranges, and grammar accuracy.',
      icon: TrendingUp,
      color: 'from-pink-500 to-rose-500'
    },
    {
      title: 'Enterprise level security',
      desc: 'Stateful JWT security, secure local sandboxing, and secure data storage policies protect your records.',
      icon: ShieldCheck,
      color: 'from-indigo-500 to-violet-500'
    }
  ];

  const pricingPlans = [
    {
      name: 'Starter Tier',
      price: '$0',
      period: 'forever',
      desc: 'Explore the basics of AI prep.',
      features: [
        '5 Free tokens on signup',
        'Conceptual mock interviews',
        'Text response inputs',
        'Basic score summaries'
      ],
      cta: 'Sign Up Free',
      popular: false,
      link: '/register'
    },
    {
      name: 'Professional Dev',
      price: '$19',
      period: 'month',
      desc: 'Build real interview confidence.',
      features: [
        '30 Interview tokens monthly',
        'Full voice speech-to-text sessions',
        'Interactive coding challenges',
        'Resume & JD gap analysis',
        'Detailed PDF feedback cards'
      ],
      cta: 'Get Started Pro',
      popular: true,
      link: '/register'
    },
    {
      name: 'Career Mastery',
      price: '$49',
      period: 'month',
      desc: 'The ultimate path to your dream job.',
      features: [
        'Unlimited mock interviews',
        'Custom JD questions generator',
        'Priority Mixtral response speeds',
        '1-on-1 AI Career Coach access',
        'Advanced historical analysis'
      ],
      cta: 'Go Unlimited',
      popular: false,
      link: '/register'
    }
  ];

  const faqs = [
    {
      q: 'How does the AI generate interview questions?',
      a: 'We use the Mixtral model to generate tailored conceptual, scenario, and coding questions based on your specific job role, experience level, and difficulty setting.'
    },
    {
      q: 'Can I do mock interviews using speech?',
      a: 'Yes! You can record your replies directly in the browser. We convert WebM audio blobs in the backend and use OpenAI Whisper to transcribe them, checking your verbal confidence and grammatical accuracy.'
    },
    {
      q: 'What is the token system and how does it work?',
      a: 'Each mock interview consumes 1 token. All new users receive 5 free tokens on registration. You can purchase additional tokens directly from your Profile settings whenever you run out.'
    },
    {
      q: 'Is my uploaded resume kept private?',
      a: 'Absolutely. Resumes are processed purely to parse skills and experience, stored securely, and are never shared with third parties.'
    }
  ];

  return (
    <div className="bg-slate-950 min-h-screen relative overflow-hidden text-slate-100 font-sans">
      {/* Decorative Radial Glows */}
      <div className="glow-spot bg-primary-600 top-[-10%] left-[-15%]"></div>
      <div className="glow-spot bg-indigo-700 top-[30%] right-[-10%]"></div>
      <div className="glow-spot bg-purple-600 bottom-[-5%] left-[20%]"></div>

      {/* Header / Navbar */}
      <nav className="relative z-10 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-white">
          <div className="p-1.5 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-lg">
            <Sparkles size={20} className="text-white" />
          </div>
          <span>Interviewer<span className="text-primary-500">.AI</span></span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/login" className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition">Login</Link>
          <Link to="/register" className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-sm font-semibold rounded-lg shadow-lg shadow-primary-600/35 transition">Register</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-20 text-center lg:pt-24 lg:pb-32">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary-500/10 border border-primary-500/30 text-primary-300 text-xs font-semibold rounded-full mb-6">
          <Brain size={12} />
          <span>Supercharged by Mixtral & Whisper</span>
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight mb-8">
          Ace Your Next Interview with <span className="text-gradient">AI Mock Coaching</span>
        </h1>
        <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Simulate comprehensive technical, HR, and behavioral assessments. Practice using voice and text, complete coding tasks, match job profiles, and unlock actionable evaluation scorecards.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link 
            to="/register" 
            className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-base font-bold rounded-xl shadow-xl shadow-primary-600/30 flex items-center justify-center gap-2 group transition-all"
          >
            <span>Start Free Prep</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link 
            to="/login" 
            className="w-full sm:w-auto px-8 py-4 bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:border-slate-700 text-base font-bold rounded-xl flex items-center justify-center transition"
          >
            Explore Dashboard
          </Link>
        </div>
      </header>

      {/* Features Overview */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-slate-900">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Features Designed for Job Seekers</h2>
          <p className="text-slate-400 max-w-xl mx-auto">Get comprehensive coverage for every stage of your career assessment.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className="glass-panel glass-panel-hover p-6 rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 rounded-full blur-xl group-hover:bg-primary-500/10 transition-colors"></div>
                <div className={`p-3 bg-gradient-to-br ${f.color} rounded-xl w-fit text-white mb-5`}>
                  <Icon size={22} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-slate-900">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Simple, Transparent Pricing</h2>
          <p className="text-slate-400 max-w-xl mx-auto">Choose a plan that fits your interview timeline. Cancel at any time.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {pricingPlans.map((plan, i) => (
            <div 
              key={i} 
              className={`glass-panel p-8 rounded-2xl flex flex-col relative overflow-hidden ${plan.popular ? 'border-primary-500 border-2' : ''}`}
            >
              {plan.popular && (
                <div className="absolute top-3 right-3 bg-primary-500 text-white px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider">
                  Popular
                </div>
              )}
              <h3 className="text-lg font-bold text-white mb-2">{plan.name}</h3>
              <p className="text-slate-400 text-xs mb-6">{plan.desc}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                <span className="text-slate-400 text-xs">/ {plan.period}</span>
              </div>
              <Link 
                to={plan.link}
                className={`w-full py-3 text-center text-sm font-bold rounded-xl transition mb-8 block ${plan.popular ? 'bg-primary-600 hover:bg-primary-700 text-white' : 'bg-slate-900 hover:bg-slate-850 text-slate-300'}`}
              >
                {plan.cta}
              </Link>
              <ul className="space-y-3.5 text-xs text-slate-300 flex-1">
                {plan.features.map((feat, idx) => (
                  <li key={idx} className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 bg-primary-400 rounded-full"></div>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-20 border-t border-slate-900">
        <h2 className="text-3xl font-extrabold text-center text-white mb-12">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="glass-panel rounded-xl overflow-hidden">
              <button 
                onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                className="w-full px-6 py-5 flex items-center justify-between text-left font-bold text-slate-200 hover:text-white transition"
              >
                <span>{faq.q}</span>
                <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 ${activeFaq === i ? 'rotate-180 text-primary-400' : ''}`} />
              </button>
              {activeFaq === i && (
                <div className="px-6 pb-5 text-sm text-slate-400 border-t border-slate-800/40 pt-4 leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 max-w-7xl mx-auto px-6 py-10 border-t border-slate-900 text-center text-xs text-slate-500">
        <p className="mb-2">&copy; {new Date().getFullYear()} Interviewer.AI. All rights reserved.</p>
        <p>Built with React, Flask, and Advanced Agentic Coding methodologies.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
