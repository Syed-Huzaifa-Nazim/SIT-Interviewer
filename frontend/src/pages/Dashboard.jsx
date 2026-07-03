import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Award,
  BookOpen,
  Calendar,
  Coins,
  FileCheck,
  Play,
  TrendingUp,
  UserCheck,
  Video,
  ChevronRight,
  TrendingDown,
  ArrowRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';

const Dashboard = () => {
  const { user, tokens } = useAuth();
  
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState([]);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const historyRes = await api.get('/interviews/history');
        setHistory(historyRes.data.slice(0, 3)); // Top 3 recent

        const achRes = await api.get('/users/achievements');
        setAchievements(achRes.data.badges || []);
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

  // Chart Mock Data
  const trendData = [
    { name: 'Mock 1', score: 65, tech: 60, comm: 70 },
    { name: 'Mock 2', score: 72, tech: 68, comm: 75 },
    { name: 'Mock 3', score: 78, tech: 75, comm: 80 },
    { name: 'Mock 4', score: lastScore || 82, tech: lastScore ? Math.round(lastScore * 0.95) : 80, comm: lastScore ? Math.round(lastScore * 1.05) : 85 },
  ];

  const skillRadarData = [
    { subject: 'Technical Accuracy', A: averageScore || 70, fullMark: 100 },
    { subject: 'Communication', A: averageScore ? Math.round(averageScore * 1.05) : 75, fullMark: 100 },
    { subject: 'Confidence', A: averageScore ? Math.round(averageScore * 0.95) : 68, fullMark: 100 },
    { subject: 'Problem Solving', A: averageScore ? Math.round(averageScore * 1.02) : 72, fullMark: 100 },
    { subject: 'Code Complexity', A: averageScore ? Math.round(averageScore * 0.90) : 65, fullMark: 100 },
  ];

  const getProfileCompleteness = () => {
    let score = 40; // Base: email, password, name
    if (user?.country) score += 20;
    if (user?.experience_level) score += 20;
    if (user?.job_role) score += 20;
    return score;
  };

  const completeness = getProfileCompleteness();

  return (
    <div className="space-y-8">
      {/* Top Welcome Banner */}
      <div className="glass-panel p-6 md:p-8 rounded-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
        
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
            Welcome back, {user?.name}!
          </h1>
          <p className="text-slate-400 text-sm md:text-base max-w-xl leading-relaxed">
            Ready to enhance your skills today? Your target role is set to <span className="text-primary-400 font-semibold">{user?.job_role}</span> ({user?.experience_level} Level).
          </p>
        </div>

        <Link
          to="/interview/start"
          className="px-6 py-3.5 bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-sm font-bold rounded-xl shadow-lg shadow-primary-600/25 flex items-center gap-2 shrink-0 transition"
        >
          <Play size={16} fill="white" />
          <span>Launch AI Interview</span>
        </Link>
      </div>

      {/* Numeric Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Available Tokens */}
        <div className="glass-panel p-6 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Available Tokens</span>
            <span className="text-3xl font-extrabold text-white">{tokens?.tokens_available ?? 0}</span>
          </div>
          <div className="p-3.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl">
            <Coins size={22} />
          </div>
        </div>

        {/* Interviews Completed */}
        <div className="glass-panel p-6 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Interviews Taken</span>
            <span className="text-3xl font-extrabold text-white">{completedInterviews.length}</span>
          </div>
          <div className="p-3.5 bg-primary-500/10 border border-primary-500/20 text-primary-400 rounded-xl">
            <Video size={22} />
          </div>
        </div>

        {/* Average Assessment Score */}
        <div className="glass-panel p-6 rounded-2xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Average Score</span>
            <span className="text-3xl font-extrabold text-white">{averageScore ? `${averageScore}%` : 'N/A'}</span>
          </div>
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
            <TrendingUp size={22} />
          </div>
        </div>

        {/* Profile Completion */}
        <div className="glass-panel p-6 rounded-2xl flex items-center justify-between">
          <div className="space-y-2 w-full pr-4">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Profile Status</span>
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-300">{completeness}% Complete</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-primary-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${completeness}%` }}
              ></div>
            </div>
          </div>
          <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
            <UserCheck size={22} />
          </div>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Trends */}
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-white mb-6">Performance Trends</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#475569" fontSize={11} tickLine={false} />
                <YAxis stroke="#475569" fontSize={11} tickLine={false} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }} />
                <Area type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#scoreColor)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Skill Gap Analysis */}
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-lg font-bold text-white mb-6">Skill Assessment Breakdown</h3>
          <div className="h-64 w-full flex justify-center items-center">
            {averageScore === 0 ? (
              <div className="text-center text-slate-500 text-sm px-8">
                <Award className="mx-auto text-slate-650 mb-3" size={32} />
                Complete your first mock interview session to unlock your skill gap radar metrics.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" radius="80%" data={skillRadarData}>
                  <PolarGrid stroke="#334155" />
                  <PolarAngleAxis dataKey="subject" stroke="#94a3b8" fontSize={10} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#475569" fontSize={8} />
                  <Radar name="Candidate" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations & Recent Interviews */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Interviews */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white">Recent Mock Interviews</h3>
            <Link to="/history" className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
              <span>View History</span>
              <ChevronRight size={14} />
            </Link>
          </div>
          
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8 text-slate-500 text-sm">Loading records...</div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-500 text-sm">
                No interviews taken yet. Complete your first session today!
              </div>
            ) : (
              history.map((mock) => (
                <div key={mock.id} className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl flex items-center justify-between gap-4 hover:border-slate-700 transition">
                  <div className="space-y-1 overflow-hidden">
                    <h4 className="font-bold text-sm text-slate-200 truncate capitalize">{mock.job_role} ({mock.type} Prep)</h4>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{new Date(mock.created_at).toLocaleDateString()}</span>
                      <span>&bull;</span>
                      <span className="capitalize">{mock.difficulty}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right shrink-0">
                      <span className={`text-sm font-extrabold ${mock.overall_score >= 80 ? 'text-emerald-400' : mock.overall_score >= 60 ? 'text-primary-400' : 'text-amber-400'}`}>
                        {mock.overall_score ? `${mock.overall_score}%` : 'Pending'}
                      </span>
                    </div>
                    {mock.status === 'completed' ? (
                      <Link 
                        to={`/interview/report/${mock.id}`}
                        className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-350 hover:text-white rounded-lg transition"
                        title="View ReportCard"
                      >
                        <ArrowRight size={16} />
                      </Link>
                    ) : (
                      <Link 
                        to={`/interview/setup/${mock.id}`}
                        className="px-3 py-1.5 bg-primary-600/20 border border-primary-500/30 text-primary-400 hover:bg-primary-600 hover:text-white text-xs font-semibold rounded-lg transition"
                      >
                        Resume
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* AI Recommendations Drawer */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <BookOpen className="text-primary-400" size={20} />
              <h3 className="text-lg font-bold text-white">AI Career Coach</h3>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-primary-500/5 border border-primary-500/10 rounded-xl text-xs leading-relaxed text-slate-300">
                <p className="font-semibold text-primary-300 mb-1.5">Actionable Suggestion:</p>
                {averageScore === 0 ? (
                  "We recommend uploading your resume to perform a gap analysis. It helps tailor mock questions to your actual profile deficiencies."
                ) : averageScore >= 80 ? (
                  "Excellent performance! To push higher, try launching a Hard difficulty mock. Focus on explaining low-level systems architectures."
                ) : (
                  "Improvement spotted in communication. Work on explaining structural complexities. Try launching the Coding Sandbox to practice JavaScript."
                )}
              </div>

              {/* Badges preview */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Recent Unlocks</span>
                <div className="flex gap-2.5 flex-wrap">
                  {achievements.slice(0, 3).map((badge) => (
                    <div 
                      key={badge.id}
                      className={`w-10 h-10 rounded-full flex items-center justify-center border transition cursor-help ${badge.unlocked ? 'bg-primary-500/10 border-primary-400/30 text-primary-400' : 'bg-slate-900/60 border-slate-800 text-slate-650'}`}
                      title={`${badge.title}: ${badge.description}`}
                    >
                      <Award size={18} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <Link 
            to="/resume-match" 
            className="w-full text-center py-3 border border-slate-800 hover:bg-slate-900/60 text-xs font-semibold rounded-xl text-slate-400 hover:text-slate-200 transition mt-6 block"
          >
            Go to Resume Matching
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
