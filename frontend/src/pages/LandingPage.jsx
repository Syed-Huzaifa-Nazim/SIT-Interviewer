import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import GlowBackground from '../components/layout/GlowBackground';
import BrandLogo from '../components/layout/BrandLogo';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Alert from '../components/ui/Alert';
import Input from '../components/ui/Input';
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
  Brain,
  Volume2,
  VolumeX,
  Play,
  Check,
  Monitor,
  Send,
  Shield,
  Menu,
  X
} from 'lucide-react';

const LandingPage = () => {
  const [activeFaq, setActiveFaq] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Interactive Simulator States
  const [simStep, setSimStep] = useState(0); // 0: idle, 1: asking, 2: answering, 3: evaluating, 4: complete
  const [simAnswer, setSimAnswer] = useState('');
  const [simMuted, setSimMuted] = useState(false);
  const [simLog, setSimLog] = useState('');

  // Contact Form States
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSuccess, setContactSuccess] = useState('');

  const navLinks = [
    { id: 'features', label: 'Features' },
    { id: 'simulator', label: 'Interactive Demo' },
    { id: 'technology', label: 'Technology' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'faqs', label: 'FAQs' },
    { id: 'contact', label: 'Contact Us' },
  ];

  const features = [
    {
      title: 'Speech-to-Text Voice Assessment',
      desc: 'Practice verbal delivery. Our integrated Whisper engine transcribes your voice replies in real-time to analyze your vocabulary breadth.',
      icon: Mic,
      color: 'from-violet-500 to-fuchsia-500'
    },
    {
      title: 'Interactive Coding Canvas',
      desc: 'Solve programming challenges inside our live browser-editor. Run execution tests and receive automated runtime reviews.',
      icon: Code,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      title: 'ATS Resume Gap Scanner',
      desc: 'Upload your PDF resume to extract skills, evaluate compatibility ratios against target roles, and identify missing keywords.',
      icon: FileText,
      color: 'from-emerald-500 to-teal-500'
    },
    {
      title: 'Custom Job Context Matching',
      desc: 'Paste any target job description. The AI instantly generates tailored, role-specific questions matching real-world expectations.',
      icon: UserCheck,
      color: 'from-amber-500 to-orange-500'
    },
    {
      title: 'Deep Performance Analytics',
      desc: 'Review metrics like technical accuracy, verbal confidence levels, speaking rate, and grammar evaluations in a single report.',
      icon: TrendingUp,
      color: 'from-pink-500 to-rose-500'
    },
    {
      title: 'Proctor Compliance System',
      desc: 'Face-mesh gaze trackers and browser tab monitors detect distractions, building compliance readiness for remote hiring tests.',
      icon: ShieldCheck,
      color: 'from-indigo-500 to-violet-500'
    }
  ];

  const pricingPlans = [
    {
      name: 'Sandbox Prep',
      price: '$0',
      period: 'free tier',
      desc: 'Explore the basics of AI interview prep.',
      features: [
        '5 Free tokens on registration',
        'Access to standard Mock Mode',
        'Text response inputs',
        'Basic scorecard metrics'
      ],
      cta: 'Get Started Free',
      popular: false,
      link: '/register'
    },
    {
      name: 'Professional Dev',
      price: '$19',
      period: 'month',
      desc: 'Build serious interview confidence.',
      features: [
        '30 Interview tokens monthly',
        'Full voice speech-to-text recording',
        'Interactive coding sandbox',
        'Resume & JD gap analysis',
        'Detailed PDF feedback reports'
      ],
      cta: 'Go Pro',
      popular: true,
      link: '/register'
    },
    {
      name: 'Enterprise Intake',
      price: '$49',
      period: 'month',
      desc: 'Official testing gatekeeper integrations.',
      features: [
        'Unlimited Mock Sandbox sessions',
        'Locked "No Mercy" Official Mode',
        'Strict proctoring & webcam snapshot checks',
        'SMIT Student Portal Webhook sync',
        'Automated Pass/Fail scoring rules'
      ],
      cta: 'Inquire Now',
      popular: false,
      link: '/register'
    }
  ];

  const faqs = [
    {
      q: 'How does Interviewer.AI generate custom questions?',
      a: 'Interviewer.AI leverages Advanced LLM services to dynamically generate tailored conceptual, scenario-based, and coding challenges. If a job description is uploaded, it extracts the requirements and builds questions specifically matching those tools and skills.'
    },
    {
      q: 'Can I practice using voice inputs?',
      a: 'Yes! Interviewer.AI features an integrated OpenAI Whisper speech-to-text engine. When you answer questions verbally, your audio is converted to text, allowing you to practice speaking naturally and receive a confidence analysis.'
    },
    {
      q: 'What is the difference between Mock Mode and Official Mode?',
      a: 'Mock Mode is a practice sandbox with educational proctoring warnings and constructive scoring to help you learn. Official Mode is a scheduled "No Mercy" test locked by administrators. It enforces strict eye-tracking proctoring, webcam breach captures, and automatic Pass/Fail status reporting.'
    },
    {
      q: 'How do candidate ranking badges work?',
      a: 'As you complete interviews and improve your average scores, your profile dynamically unlocks higher rank tiers: Bronze, Silver, Gold, and Platinum. These ranks showcase your performance consistency.'
    }
  ];

  // Interactive Simulator Logic
  const startSim = () => {
    setSimStep(1);
    setSimLog("AI Recruiter is composing the question...");
  };

  useEffect(() => {
    if (simStep === 1) {
      const timer = setTimeout(() => {
        setSimStep(2);
        setSimLog("Question Composition Complete. Speaker Active.");
        // Simulated Speak
        if ('speechSynthesis' in window && !simMuted) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance("What is the main advantage of using the Virtual DOM in React?");
          utterance.rate = 1.0;
          window.speechSynthesis.speak(utterance);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [simStep, simMuted]);

  const submitSimAnswer = (e) => {
    e.preventDefault();
    if (!simAnswer.trim()) return;
    setSimStep(3);
    setSimLog("Speech-To-Text processing complete. Composing scorecard...");
    
    // Simulate scoring delay
    setTimeout(() => {
      setSimStep(4);
      setSimLog("Evaluation complete. Scores pushed.");
    }, 3000);
  };

  const resetSim = () => {
    setSimStep(0);
    setSimAnswer('');
    setSimLog('');
  };

  const handleContactSubmit = (e) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactMessage) return;
    setContactSuccess("Your message has been received! Our support panel will email you shortly.");
    setContactName('');
    setContactEmail('');
    setContactMessage('');
    setTimeout(() => setContactSuccess(''), 6000);
  };

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleNavClick = (id) => {
    scrollToSection(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-950 min-h-screen relative overflow-hidden text-slate-900 dark:text-slate-100 font-sans">
      <GlowBackground variant="landing" />

      {/* Header / Navbar */}
      <nav className="relative z-20 max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <BrandLogo />

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-6 text-sm text-slate-500 dark:text-slate-400 font-semibold">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => handleNavClick(link.id)}
                className="hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden sm:inline-flex px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="hidden sm:inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all duration-200 px-3 py-1.5 text-xs bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-white shadow-lg shadow-primary-600/25"
            >
              Register
            </Link>

            {/* Mobile Hamburger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 p-4 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 space-y-1 animate-slide-up">
            {navLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => handleNavClick(link.id)}
                className="w-full text-left px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-xl transition cursor-pointer"
              >
                {link.label}
              </button>
            ))}
            <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-2.5 text-center text-xs font-bold rounded-xl bg-slate-900 dark:bg-slate-900/60 border border-slate-700 hover:border-slate-600 text-slate-200 hover:bg-slate-800 transition"
              >
                Login
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-2.5 text-center text-xs font-bold rounded-xl bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-white shadow-lg shadow-primary-600/25 transition"
              >
                Register
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Header Section */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-16 text-center lg:pt-20 lg:pb-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="text-left space-y-6">
          <Badge variant="primary" size="lg" className="normal-case tracking-normal">
            <Brain size={12} />
            Next-Gen SMIT Intake Partner
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-tight text-slate-900 dark:text-white">
            Ace Your Intake with <span className="text-gradient">Interviewer.AI</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
            Simulate realistic technical and behavioral assessments. Practice using voice or text responses, solve code complexities, match job specifications, and view evaluation feedback scorecards.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link
              to="/register"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 font-bold rounded-xl transition-all duration-200 px-8 py-3.5 text-sm bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-white shadow-xl shadow-primary-600/30 group"
            >
              <span>Get Started Free</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Button
              variant="secondary"
              size="lg"
              icon={Play}
              onClick={() => scrollToSection('simulator')}
              className="w-full sm:w-auto"
            >
              Watch Live Demo
            </Button>
          </div>
        </div>

        {/* Hero Interactive Recruiter Simulator Widget */}
        <div id="simulator" className="relative z-10 scroll-mt-24">
          <Card className="border border-slate-200 dark:border-slate-800 shadow-2xl text-left space-y-5 relative overflow-hidden bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary-500/5 rounded-full blur-xl" aria-hidden="true" />
            
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Workspace Simulator</span>
              </div>
              <button 
                onClick={() => setSimMuted(!simMuted)} 
                className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
                title={simMuted ? "Unmute Sim Voice" : "Mute Sim Voice"}
              >
                {simMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>

            {simStep === 0 && (
              <div className="py-10 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-500 dark:text-primary-400 mx-auto flex items-center justify-center animate-pulse">
                  <Brain size={28} />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Interactive AI Recruiter Demo</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">Click below to experience how the portal evaluates candidate responses in real-time.</p>
                </div>
                <Button size="sm" onClick={startSim}>
                  Start Demo Simulation
                </Button>
              </div>
            )}

            {simStep === 1 && (
              <div className="py-8 text-center space-y-4">
                <div className="animate-spin w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full mx-auto" />
                <span className="text-xs text-slate-500 dark:text-slate-400 block">{simLog}</span>
              </div>
            )}

            {simStep === 2 && (
              <div className="space-y-5">
                <div className="p-4 bg-primary-500/5 border border-primary-500/10 rounded-xl space-y-2">
                  <span className="text-[10px] font-bold text-primary-500 dark:text-primary-400 uppercase tracking-wider block">AI Recruiter Prompt:</span>
                  <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
                    "What is the main advantage of using the Virtual DOM in React, and how does reconciliation work?"
                  </p>
                </div>

                <form onSubmit={submitSimAnswer} className="space-y-3">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Type candidate answer (simulate text response):</label>
                  <textarea
                    className="w-full glass-input text-xs min-h-16"
                    placeholder="e.g. Virtual DOM is a lightweight copy of real DOM. React diffs it and reconciles state..."
                    value={simAnswer}
                    onChange={(e) => setSimAnswer(e.target.value)}
                    required
                  />
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex gap-2">
                      <button 
                        type="button"
                        onClick={() => setSimAnswer("Virtual DOM is a copy of real DOM. React diffs it and reconciles state to optimize updates.")}
                        className="text-[10px] text-primary-500 dark:text-primary-400 hover:underline cursor-pointer"
                      >
                        Autofill Good Answer
                      </button>
                      <button 
                        type="button"
                        onClick={() => setSimAnswer("I know nothing about React.")}
                        className="text-[10px] text-red-500 dark:text-red-400 hover:underline cursor-pointer"
                      >
                        Autofill Empty Answer
                      </button>
                    </div>
                    <Button type="submit" size="sm" icon={Send} className="!px-4 !py-2">
                      Submit Answer
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {simStep === 3 && (
              <div className="py-8 text-center space-y-4">
                <div className="animate-bounce p-3 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-xl w-fit mx-auto">
                  <Sparkles size={24} className="text-white animate-pulse" />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">{simLog}</span>
              </div>
            )}

            {simStep === 4 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">AI Scorecard Evaluation</h4>
                  <Badge variant={simAnswer.includes("nothing") ? 'error' : 'success'} className={simAnswer.includes("nothing") ? 'animate-pulse' : ''}>
                    {simAnswer.includes("nothing") ? '0.0% Score (FAIL)' : '71.3% Score (PASS)'}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2.5 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg">
                    <span className="text-[9px] text-slate-500 block">Technical</span>
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 block">
                      {simAnswer.includes("nothing") ? '0%' : '91%'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg">
                    <span className="text-[9px] text-slate-500 block">Communication</span>
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 block">
                      {simAnswer.includes("nothing") ? '10%' : '75%'}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg">
                    <span className="text-[9px] text-slate-500 block">Confidence</span>
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 block">
                      {simAnswer.includes("nothing") ? '10%' : '68%'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 text-xs">
                  <span className="font-bold text-slate-600 dark:text-slate-300 block">AI Feedback summary:</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal font-sans">
                    {simAnswer.includes("nothing") 
                      ? "The candidate provided no substantive technical response or explicitly stated that they do not know the answer."
                      : "Excellent! Your response demonstrated a strong technical understanding. You correctly referenced key terms: DOM, reconciliation, state."
                    }
                  </p>
                </div>

                <Button variant="secondary" fullWidth size="sm" onClick={resetSim}>
                  Run Another Simulation
                </Button>
              </div>
            )}
          </Card>
        </div>
      </header>

      {/* Features Showcase Section */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-slate-200 dark:border-slate-800 scroll-mt-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Interviewer Features for Candidates & Admin</h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto text-sm font-sans">Designed specifically to scale admissions evaluations, resume matches, and cheat-proof proctoring checks.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <Card key={i} variant="interactive" className="relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/5 rounded-full blur-xl group-hover:bg-primary-500/10 transition-colors" aria-hidden="true" />
                <div className={`p-3 bg-gradient-to-br ${f.color} rounded-xl w-fit text-white mb-5`}>
                  <Icon size={22} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed font-sans">{f.desc}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Technology Integration Section */}
      <section id="technology" className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-slate-200 dark:border-slate-800 scroll-mt-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6 text-left">
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">How Our AI Stack Works</h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-sans">
              Interviewer.AI combines state-of-the-art transcription models, visual computer vision checks, and advanced LLM reasoning prompts to evaluate, transcribe, and proctor interview sessions securely.
            </p>
            <div className="space-y-4 font-sans">
              <div className="flex gap-4 items-start">
                <div className="p-2 bg-primary-500/10 border border-primary-500/20 text-primary-500 dark:text-primary-400 rounded-lg shrink-0">
                  <Brain size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Mixtral / Claude 3.5 Sonnet Brain</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">Evaluates answers, performs code reviews, assesses strengths/weaknesses, and matches job description parameters.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 rounded-lg shrink-0">
                  <Mic size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">OpenAI Whisper Speech Engine</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">Transcribes verbal recordings inside the candidate workspace, tracking verbal pauses and communication pace.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 dark:text-cyan-400 rounded-lg shrink-0">
                  <Shield size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">MediaPipe Computer Vision Eyes</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">Maintains exam integrity by checking gaze orientation, face presence, and tab switches locally in the browser.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 bg-slate-100 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-2xl relative overflow-hidden flex items-center justify-center aspect-square">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5 rounded-full border border-primary-500/15 animate-ping" aria-hidden="true" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/5 h-3/5 rounded-full border border-indigo-500/10 animate-pulse" aria-hidden="true" />
            <div className="relative text-center space-y-4">
              <div className="p-6 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-full w-24 h-24 mx-auto flex items-center justify-center shadow-lg shadow-primary-500/20 animate-pulse">
                <Monitor size={36} className="text-white" />
              </div>
              <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">Self-Contained Secure Engine</h4>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-sans">No installation required</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-slate-200 dark:border-slate-800 scroll-mt-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-4">Transparent Pricing Tiers</h2>
          <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto text-sm font-sans">Pick a mock prep package or request custom enterprise evaluation configurations.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {pricingPlans.map((plan, i) => (
            <Card
              key={i}
              className={`flex flex-col relative overflow-hidden ${plan.popular ? 'border-2 border-primary-500' : ''}`}
            >
              {plan.popular && (
                <Badge variant="primary" className="absolute top-3 right-3 !text-[8px]">
                  Popular
                </Badge>
              )}
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{plan.name}</h3>
              <p className="text-slate-600 dark:text-slate-400 text-xs mb-6 font-sans">{plan.desc}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{plan.price}</span>
                <span className="text-slate-500 text-xs">/ {plan.period}</span>
              </div>
              <Link
                to={plan.link}
                className={`w-full py-3 text-center text-xs font-bold rounded-xl transition mb-8 block ${
                  plan.popular
                    ? 'bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-white shadow-lg shadow-primary-600/25'
                    : 'bg-slate-900 dark:bg-slate-900/60 border border-slate-700 hover:border-slate-600 text-slate-200 hover:bg-slate-800'
                }`}
              >
                {plan.cta}
              </Link>
              <ul className="space-y-3.5 text-[11px] text-slate-600 dark:text-slate-300 flex-1 font-sans">
                {plan.features.map((feat, idx) => (
                  <li key={idx} className="flex items-center gap-2.5">
                    <Check size={12} className="text-primary-500 dark:text-primary-400 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faqs" className="relative z-10 max-w-4xl mx-auto px-6 py-20 border-t border-slate-200 dark:border-slate-800 scroll-mt-24">
        <h2 className="text-3xl font-extrabold text-center text-slate-900 dark:text-white mb-12">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <Card key={i} padding={false} className="overflow-hidden">
              <button 
                onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                className="w-full px-6 py-5 flex items-center justify-between text-left font-bold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white transition text-sm cursor-pointer"
              >
                <span>{faq.q}</span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform duration-300 shrink-0 ml-4 ${activeFaq === i ? 'rotate-180 text-primary-500 dark:text-primary-400' : ''}`} />
              </button>
              {activeFaq === i && (
                <div className="px-6 pb-5 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-4 leading-relaxed font-sans">
                  {faq.a}
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* Contact Us Form Section */}
      <section id="contact" className="relative z-10 max-w-xl mx-auto px-6 py-20 border-t border-slate-200 dark:border-slate-800 scroll-mt-24">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-3">Get in Touch</h2>
          <p className="text-slate-600 dark:text-slate-400 text-xs font-sans">Have questions about SMIT integrations or custom packages? Send us a message.</p>
        </div>

        {contactSuccess ? (
          <Alert variant="success" className="text-xs text-center font-bold font-sans">{contactSuccess}</Alert>
        ) : (
          <Card className="space-y-4">
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <Input
                label="Your Name"
                type="text"
                placeholder="e.g. Alexander Graham"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                inputClassName="text-xs"
                required
              />
              <Input
                label="Email Address"
                type="email"
                placeholder="name@company.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                inputClassName="text-xs"
                required
              />
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Message Description</label>
                <textarea
                  className="w-full glass-input text-xs min-h-24"
                  placeholder="Ask us about features, portal routing, or trial runs..."
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" fullWidth size="sm">
                Send Message
              </Button>
            </form>
          </Card>
        )}
      </section>

      {/* Footer */}
      <footer className="relative z-10 max-w-7xl mx-auto px-6 py-10 border-t border-slate-200 dark:border-slate-800 text-center text-[10px] text-slate-500 space-y-2">
        <div className="flex flex-wrap justify-center gap-6 text-slate-500 dark:text-slate-400 font-bold mb-4">
          <button onClick={() => scrollToSection('features')} className="hover:text-slate-900 dark:hover:text-white transition cursor-pointer">Features</button>
          <button onClick={() => scrollToSection('simulator')} className="hover:text-slate-900 dark:hover:text-white transition cursor-pointer">Mock Demo</button>
          <button onClick={() => scrollToSection('pricing')} className="hover:text-slate-900 dark:hover:text-white transition cursor-pointer">Pricing</button>
          <button onClick={() => scrollToSection('contact')} className="hover:text-slate-900 dark:hover:text-white transition cursor-pointer">Contact</button>
        </div>
        <p>&copy; {new Date().getFullYear()} Interviewer.AI. All rights reserved.</p>
        <p>Developed with React, Flask, and Advanced Agentic Engineering methodologies.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
