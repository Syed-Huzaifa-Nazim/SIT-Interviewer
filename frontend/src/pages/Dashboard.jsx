import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import StatCard from '../components/ui/StatCard';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import {
  Award,
  BookOpen,
  Coins,
  Play,
  TrendingUp,
  Video,
  ChevronRight,
  ArrowRight,
  Crown,
  Sparkles,
  Shield,
  Check
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';

const Dashboard = () => {
  const { user, tokens } = useAuth();
  
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coachActive, setCoachActive] = useState(false);
  const [coachResponse, setCoachResponse] = useState('');
  const [coachInput, setCoachInput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const historyRes = await api.get('/interviews/history');
        setHistory(historyRes.data || []);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, []);

  // Compute stats
  const completedInterviews = history.filter(i => i.status === 'completed');
  const lastScore = completedInterviews[0]?.overall_score || 0;
  
  // Calculate average score
  const totalScores = completedInterviews.reduce((sum, item) => sum + item.overall_score, 0);
  const averageScore = completedInterviews.length > 0 ? Math.round(totalScores / completedInterviews.length) : 0;

  // Dynamic Rank Badge System based on completed count and avg score
  const getRankBadge = (count, avgScore) => {
    if (count >= 10 || avgScore >= 90) {
      return {
        name: 'Platinum Elite',
        color: 'from-slate-400 via-cyan-400 to-slate-200 text-cyan-400 border-cyan-500/30 shadow-cyan-500/10',
        badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
        icon: Crown,
        gradient: 'from-cyan-400 to-indigo-500',
        desc: 'Top 1% candidate score. Master of coding & verbal tracks.'
      };
    } else if (count >= 6 || avgScore >= 75) {
      return {
        name: 'Gold Professional',
        color: 'from-amber-500 via-yellow-400 to-amber-600 text-amber-400 border-amber-500/35 shadow-amber-500/10',
        badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
        icon: Crown,
        gradient: 'from-amber-400 to-yellow-500',
        desc: 'Advanced technical accuracy and stable proctoring audits.'
      };
    } else if (count >= 3 || avgScore >= 60) {
      return {
        name: 'Silver Practitioner',
        color: 'from-slate-400 via-slate-200 to-slate-400 text-slate-300 border-slate-400/20 shadow-slate-500/5',
        badgeClass: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
        icon: Award,
        gradient: 'from-slate-300 to-slate-500',
        desc: 'Consistent practitioner showing steady progress.'
      };
    } else if (count >= 1) {
      return {
        name: 'Bronze Aspirant',
        color: 'from-orange-700 via-amber-800 to-orange-900 text-orange-400 border-orange-800/20 shadow-orange-500/5',
        badgeClass: 'bg-orange-500/10 text-orange-300 border-orange-500/20',
        icon: Award,
        gradient: 'from-orange-500 to-amber-700',
        desc: 'Completed initial evaluations. Ready to grow.'
      };
    } else {
      return {
        name: 'Basic Member',
        color: 'from-slate-800 to-slate-900 text-slate-500 border-slate-900/60 shadow-none',
        badgeClass: 'bg-slate-900/40 text-slate-500 border-slate-800',
        icon: Shield,
        gradient: 'from-slate-700 to-slate-800',
        desc: 'Mock testing sandbox enabled. Complete your first assessment to unlock ranks.'
      };
    }
  };

  const rank = getRankBadge(completedInterviews.length, averageScore);
  const RankIcon = rank.icon;

  // Chart Data
  const trendData = completedInterviews.length > 0 
    ? [...completedInterviews].reverse().map((mock, idx) => ({
        name: `Mock ${idx + 1}`,
        score: mock.overall_score
      }))
    : [
        { name: 'Mock 1', score: 0 },
        { name: 'Mock 2', score: 0 },
        { name: 'Mock 3', score: 0 }
      ];

  const getProfileCompleteness = () => {
    let score = 40;
    if (user?.country) score += 20;
    if (user?.experience_level) score += 20;
    if (user?.job_role) score += 20;
    return score;
  };

  const completeness = getProfileCompleteness();

  // Simulated Career Coach Logic
  const askCoach = (e) => {
    e.preventDefault();
    if (!coachInput.trim()) return;
    setCoachLoading(true);
    setCoachActive(true);

    setTimeout(() => {
      let reply = "";
      const q = coachInput.toLowerCase();
      if (q.includes("token") || q.includes("purchase")) {
        reply = "Mock sessions consume 1 token. You can top up tokens instantly under Profile settings. If you belong to a SMIT Bootcamp intake, tokens are managed and pre-funded by administrators.";
      } else if (q.includes("proctor") || q.includes("fail") || q.includes("terminate")) {
        reply = "Interviewer.AI includes a proctoring simulator. In 'Official Mode', tab-switches or camera look-aways flag warnings. A third warning terminates the interview immediately, uploads webcam evidence, and blocks access temporarily.";
      } else if (q.includes("resume") || q.includes("jd")) {
        reply = "Use our Resume & JD Analyzer tool! Uploading your PDF resume maps your skills against a job description, helping our AI generate custom, highly tailored questions.";
      } else {
        reply = `To prepare for a ${user?.job_role || 'developer'} role, focus on core concepts. Try launching a Mock session on entry difficulty first, review your scorecard, and then work up to Hard mode.`;
      }
      setCoachResponse(reply);
      setCoachLoading(false);
      setCoachInput('');
    }, 1500);
  };

  return (
    <div className="space-y-8">
      
      {/* Dynamic Glassmorphic Welcome & Rank Badge Banner */}
      <Card className="relative overflow-hidden flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className={`absolute top-0 right-0 w-64 h-64 opacity-15 rounded-full blur-3xl bg-gradient-to-tr ${rank.gradient}`}></div>
        
        <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${rank.color} border shadow-lg flex items-center justify-center shrink-0`}>
            <RankIcon size={32} className="animate-pulse" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Welcome, {user?.name}!
              </h1>
              <Badge className={rank.badgeClass} size="lg">
                {rank.name}
              </Badge>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm mt-2 leading-relaxed max-w-xl">
              Active Focus: <span className="text-primary-500 dark:text-primary-400 font-bold">{user?.job_role}</span> ({user?.experience_level} Level). {rank.desc}
            </p>
          </div>
        </div>

        <Link to="/interview/start" className="w-full lg:w-auto shrink-0">
          <Button size="lg" icon={Play} fullWidth className="lg:w-auto">
            Launch Interview Session
          </Button>
        </Link>
      </Card>

      {/* Numeric Highlights & Circular Index */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Available Tokens"
          value={tokens?.tokens_available ?? 0}
          subtext={
            <Link to="/profile" className="text-primary-500 dark:text-primary-400 hover:underline font-bold">
              Get more tokens &rarr;
            </Link>
          }
          icon={Coins}
          iconColor="text-yellow-500 dark:text-yellow-400"
          iconBg="bg-yellow-500/10 border-yellow-500/20"
        />

        <StatCard
          label="Interviews Completed"
          value={completedInterviews.length}
          subtext="Across all technical focuses"
          icon={Video}
        />

        {/* Dynamic Interview Readiness Index (IRI) Ring */}
        <Card className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Readiness Index</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white block">
              {averageScore ? `${averageScore}%` : 'N/A'}
            </span>
            <span className="text-[9px] text-slate-500 block leading-tight">Weighted score from historical mocks.</span>
          </div>
          
          <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
            <svg className="absolute w-full h-full transform -rotate-90">
              <circle cx="32" cy="32" r="28" stroke="rgba(148,163,184,0.15)" className="dark:stroke-white/5" strokeWidth="4" fill="transparent" />
              <circle 
                cx="32" 
                cy="32" 
                r="28" 
                stroke="url(#iriGrad)" 
                strokeWidth="4" 
                fill="transparent" 
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * (1 - (averageScore || 0) / 100)}`}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="iriGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-[10px] font-black text-slate-700 dark:text-slate-200">
              {averageScore ? `${averageScore}%` : '0%'}
            </span>
          </div>
        </Card>
      </div>

      {/* Analytics Trend & Interactive AI Coach Console */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Performance Trend Chart */}
        <Card className="lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Performance Score Trends</h3>
            <span className="text-[10px] text-slate-500">Updates per mock completion</span>
          </div>
          <div className="h-60 w-full">
            {completedInterviews.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                message="No historical scores recorded yet. Launch your first mock to see trend analytics."
                actionLabel="Start Interview"
                actionTo="/interview/start"
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#091122', borderColor: 'rgba(255,255,255,0.06)', borderRadius: '12px', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="score" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#trendGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Unique Feature: Interactive AI Career Coach Terminal */}
        <Card className="flex flex-col justify-between relative overflow-hidden">
          <div>
            <CardHeader className="flex items-center gap-2 pb-3 mb-4">
              <div className="p-1 bg-primary-500/10 border border-primary-500/30 text-primary-500 dark:text-primary-400 rounded-lg">
                <BookOpen size={16} />
              </div>
              <CardTitle className="text-sm mb-0">AI Career Coach</CardTitle>
            </CardHeader>

            {!coachActive ? (
              <div className="space-y-4">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Hello! I am your Interviewer.AI Career Coach. Ask me questions about preparation strategy, token consumption, or proctoring rules.
                </p>
                <div className="p-3 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 text-[10px] text-slate-600 dark:text-slate-300">
                  <p className="font-bold text-primary-600 dark:text-primary-300 flex items-center gap-1">
                    <Sparkles size={10} />
                    <span>Quick Suggestion:</span>
                  </p>
                  <p className="leading-normal">
                    {averageScore === 0 
                      ? "Complete a basic React or Python mock session to feed historical analytics to my advisor module."
                      : averageScore >= 80 
                      ? "Outstanding results! Try scaling difficulty to Hard to evaluate advanced structures."
                      : "We suggest running a resume gap analysis to locate missing keywords."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {coachLoading ? (
                  <Spinner size="sm" label="Analyzing request..." className="py-6" />
                ) : (
                  <div className="p-3.5 bg-primary-500/5 border border-primary-500/10 rounded-xl text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    <span className="font-bold text-primary-600 dark:text-primary-400 block mb-1">Coach Response:</span>
                    {coachResponse}
                  </div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={askCoach} className="mt-4 space-y-2">
            <input
              type="text"
              placeholder="Ask about proctoring, resume matching..."
              className="w-full glass-input text-xs"
              value={coachInput}
              onChange={(e) => setCoachInput(e.target.value)}
              required
              disabled={coachLoading}
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                fullWidth
                disabled={coachLoading}
              >
                Query Advisor
              </Button>
              {coachActive && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setCoachActive(false); setCoachResponse(''); }}
                >
                  Clear
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>

      {/* Recent Interviews & Profile completeness */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Mocks */}
        <Card className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Mock Interviews</h3>
            <Link to="/history" className="text-xs text-primary-500 dark:text-primary-400 hover:text-primary-600 dark:hover:text-primary-300 flex items-center gap-1 font-bold">
              <span>All History</span>
              <ChevronRight size={12} />
            </Link>
          </div>

          <div className="space-y-3.5">
            {loading ? (
              <Spinner size="sm" label="Loading mock records..." className="py-6" />
            ) : history.length === 0 ? (
              <EmptyState
                icon={Video}
                message="No interviews taken yet. Complete your first session to build your profile!"
                actionLabel="Start Interview"
                actionTo="/interview/start"
              />
            ) : (
              history.slice(0, 3).map((mock) => (
                <div key={mock.id} className="p-4 bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition">
                  <div className="space-y-1 overflow-hidden">
                    <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 capitalize truncate">{mock.job_role} ({mock.type})</h4>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span>{new Date(mock.created_at).toLocaleDateString()}</span>
                      <span>&bull;</span>
                      <span className="capitalize">{mock.difficulty}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs font-extrabold ${mock.overall_score >= 80 ? 'text-emerald-500 dark:text-emerald-400' : mock.overall_score >= 60 ? 'text-primary-500 dark:text-primary-400' : 'text-amber-500 dark:text-amber-400'}`}>
                      {mock.overall_score ? `${mock.overall_score}%` : '0%'}
                    </span>
                    {mock.status === 'completed' ? (
                      <Link
                        to={`/interview/report/${mock.id}`}
                        className="p-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg transition"
                      >
                        <ArrowRight size={14} />
                      </Link>
                    ) : (
                      <Link to={`/interview/setup/${mock.id}`}>
                        <Button size="sm" variant="secondary">Resume</Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Profile Completeness Checklist card */}
        <Card className="flex flex-col justify-between">
          <div className="space-y-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-3">Intake Requirements</h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-500 dark:text-slate-400">Profile Completeness</span>
                <span className="text-primary-500 dark:text-primary-400">{completeness}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-900 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-primary-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${completeness}%` }}
                />
              </div>
            </div>

            <div className="space-y-2.5 text-[10px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <div className={`p-0.5 rounded-full ${user?.name ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-900 text-slate-500 dark:text-slate-600'}`}>
                  <Check size={10} />
                </div>
                <span>Full candidate profile name</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`p-0.5 rounded-full ${user?.country ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-900 text-slate-500 dark:text-slate-600'}`}>
                  <Check size={10} />
                </div>
                <span>Country details updated</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`p-0.5 rounded-full ${user?.experience_level ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-900 text-slate-500 dark:text-slate-600'}`}>
                  <Check size={10} />
                </div>
                <span>Experience level criteria set</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`p-0.5 rounded-full ${user?.job_role ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-900 text-slate-500 dark:text-slate-600'}`}>
                  <Check size={10} />
                </div>
                <span>Target role title matching presets</span>
              </div>
            </div>
          </div>

          <Link to="/profile" className="mt-5 block">
            <Button variant="secondary" size="sm" fullWidth>
              Update Profile Data
            </Button>
          </Link>
        </Card>

      </div>

    </div>
  );
};

export default Dashboard;
