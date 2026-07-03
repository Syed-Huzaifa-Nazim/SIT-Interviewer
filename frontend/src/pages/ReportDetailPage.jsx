import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import {
  Award,
  BookOpen,
  Calendar,
  ChevronLeft,
  FileCheck,
  Printer,
  Sparkles,
  TrendingUp,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Info,
  ShieldAlert
} from 'lucide-react';

const ReportDetailPage = () => {
  const { id } = useParams();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Feedback form states
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [issuesReported, setIssuesReported] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await api.get(`/interviews/${id}/report`);
        setData(res.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to retrieve assessment scorecard.');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [id]);

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    setFeedbackLoading(true);
    try {
      await api.post('/feedback', {
        rating,
        feedback_text: feedbackText,
        issues_reported: issuesReported,
        interview_id: parseInt(id)
      });
      setFeedbackSubmitted(true);
    } catch (err) {
      console.error('Failed to submit user feedback:', err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="glass-panel p-8 rounded-2xl text-center max-w-md mx-auto">
        <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-400">Loading performance report...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel p-6 rounded-2xl text-center max-w-md mx-auto space-y-4">
        <AlertCircle className="mx-auto text-red-400" size={32} />
        <h3 className="font-bold text-lg text-white">Error Loading Report</h3>
        <p className="text-slate-400 text-sm">{error || 'Report details could not be found.'}</p>
        <Link to="/dashboard" className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-semibold">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { interview, report, qna } = data;

  let strengths = [];
  try {
    if (Array.isArray(report.strengths)) {
      strengths = report.strengths;
    } else {
      strengths = JSON.parse(report.strengths || '[]');
      if (typeof strengths === 'string') {
        strengths = JSON.parse(strengths || '[]');
      }
    }
    if (!Array.isArray(strengths)) strengths = [];
  } catch (err) {
    strengths = [];
  }

  let weaknesses = [];
  try {
    if (Array.isArray(report.weaknesses)) {
      weaknesses = report.weaknesses;
    } else {
      weaknesses = JSON.parse(report.weaknesses || '[]');
      if (typeof weaknesses === 'string') {
        weaknesses = JSON.parse(weaknesses || '[]');
      }
    }
    if (!Array.isArray(weaknesses)) weaknesses = [];
  } catch (err) {
    weaknesses = [];
  }

  let proctorLogsList = [];
  try {
    const rawLogs = interview.proctor_logs;
    if (Array.isArray(rawLogs)) {
      proctorLogsList = rawLogs;
    } else if (rawLogs) {
      if (typeof rawLogs === 'string') {
        proctorLogsList = JSON.parse(rawLogs || '[]');
        if (typeof proctorLogsList === 'string') {
          proctorLogsList = JSON.parse(proctorLogsList || '[]');
        }
      } else {
        proctorLogsList = rawLogs;
      }
    }
    if (!Array.isArray(proctorLogsList)) {
      proctorLogsList = [];
    }
  } catch (err) {
    console.warn("Failed to parse proctor logs:", err);
    proctorLogsList = [];
  }

  const subScores = [
    { name: 'Technical Depth', score: report.technical_score, color: 'from-blue-500 to-indigo-500' },
    { name: 'Communication Style', score: report.communication_score, color: 'from-violet-500 to-fuchsia-500' },
    { name: 'Verbal Confidence', score: report.confidence_score, color: 'from-amber-500 to-orange-500' },
    { name: 'Problem Solving', score: report.problem_solving_score, color: 'from-emerald-500 to-teal-500' }
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto print:bg-white print:text-black">
      {/* Top Breadcrumb Nav - Hidden in print */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link to="/history" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition text-sm">
          <ChevronLeft size={16} />
          <span>Back to History</span>
        </Link>

        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-bold rounded-lg flex items-center gap-1.5 transition text-slate-300 hover:text-white"
        >
          <Printer size={14} />
          <span>Print / Export PDF</span>
        </button>
      </div>

      {/* Proctoring Warning Alert */}
      {interview.is_proctor_failed && (
        <div className="space-y-6">
          <div className="p-5 bg-red-950/25 border border-red-500/30 rounded-2xl flex items-start gap-4">
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl shrink-0">
              <ShieldAlert size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-white text-base">Session Terminated due to Proctor Violations</h3>
              <p className="text-xs text-red-400/90 leading-relaxed">
                This interview mock session was automatically shut down because the candidate accumulated 3 or more proctoring compliance infractions. The scorecard ratings are voided.
              </p>
            </div>
          </div>

          {/* Snapshot & Description Card */}
          {report.snapshot_image && (
            <div className="glass-panel p-6 rounded-2xl border border-red-500/20 bg-red-950/5 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="md:col-span-1 relative aspect-video rounded-xl bg-slate-950 border border-slate-900 overflow-hidden flex items-center justify-center shrink-0">
                <img 
                  src={report.snapshot_image} 
                  alt="Integrity Breach Frame Snapshot" 
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-[8px] font-bold text-white uppercase rounded tracking-wider">
                  Violation Snapshot
                </div>
              </div>
              
              <div className="md:col-span-2 space-y-2">
                <h4 className="font-bold text-sm text-slate-200">Incident Evidence File</h4>
                <p className="text-xs text-slate-350 leading-relaxed font-sans">
                  {report.snapshot_description || "No screenshot description was logged by the system proctoring engine."}
                </p>
                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-[10px] text-slate-400">
                  <span className="font-bold text-red-400">Compliance Audit:</span> A copy of this report card and visual evidence has been transmitted to administrative monitoring. Re-offending 3 times will lock your account.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Stats Header */}
      <div className="glass-panel p-6 md:p-8 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-primary-500/15 border border-primary-500/20 text-primary-400 font-bold px-2.5 py-0.5 rounded-full capitalize">
              {interview.type} Prep
            </span>
            <span className="text-xs bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
              {interview.difficulty}
            </span>
          </div>
          
          <h1 className="text-2xl md:text-3xl font-extrabold text-white capitalize leading-tight">
            {interview.job_role} Scorecard
          </h1>
          
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Calendar size={14} />
            <span>Completed on {new Date(interview.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Big Overall Score Ring */}
        <div className="flex items-center gap-4 bg-slate-950/60 p-4 border border-slate-800/80 rounded-2xl shrink-0">
          <div className="text-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">Overall Assessment</span>
            <span className={`text-4xl font-black block mt-1 ${report.overall_score >= 80 ? 'text-emerald-400' : report.overall_score >= 60 ? 'text-primary-400' : 'text-amber-400'}`}>
              {report.overall_score}%
            </span>
          </div>
          <div className="p-3 bg-primary-500/10 border border-primary-500/20 text-primary-400 rounded-xl">
            <Award size={24} />
          </div>
        </div>
      </div>

      {/* Sub Score Progress Blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {subScores.map((score, idx) => (
          <div key={idx} className="glass-panel p-5 rounded-2xl space-y-3">
            <span className="text-xs font-semibold text-slate-400 block">{score.name}</span>
            <div className="flex items-baseline justify-between">
              <span className="text-xl font-extrabold text-white">{score.score}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-primary-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${score.score}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>

      {/* Strengths & Weaknesses Split Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Strengths */}
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 font-bold border-b border-slate-850 pb-3">
            <ThumbsUp size={18} />
            <h4>Identified Strengths</h4>
          </div>
          <ul className="space-y-3.5 text-xs text-slate-300">
            {strengths.length === 0 ? (
              <li className="text-slate-500">No strengths logged.</li>
            ) : (
              strengths.map((str, idx) => (
                <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mt-1.5 shrink-0"></div>
                  <span>{str}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Weaknesses */}
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 text-red-400 font-bold border-b border-slate-850 pb-3">
            <ThumbsDown size={18} />
            <h4>Areas for Improvement</h4>
          </div>
          <ul className="space-y-3.5 text-xs text-slate-300">
            {weaknesses.length === 0 ? (
              <li className="text-slate-500">No major weaknesses identified. Perfect!</li>
            ) : (
              weaknesses.map((weak, idx) => (
                <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full mt-1.5 shrink-0"></div>
                  <span>{weak}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Detailed Recommendations & Concepts */}
      <div className="glass-panel p-6 md:p-8 rounded-2xl space-y-6">
        <div className="flex items-center gap-2.5 text-primary-400 font-bold border-b border-slate-900 pb-4">
          <BookOpen size={20} />
          <h3>AI Coach recommendations</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Recommendations list */}
          <div className="md:col-span-2 space-y-3">
            <span className="text-xs font-bold text-slate-450 uppercase tracking-wider block">Suggested Improvement Steps</span>
            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
              {report.recommendations || 'No specific improvements registered.'}
            </div>
          </div>

          {/* Missing Concepts Box */}
          <div className="p-5 bg-slate-900/60 border border-slate-850 rounded-xl space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Info size={14} className="text-primary-400" />
              <span>Missing Concepts</span>
            </div>
            <p className="text-xs text-slate-350 leading-relaxed">
              {report.missing_concepts || 'No missing technical concepts identified.'}
            </p>
          </div>
        </div>
      </div>

      {/* Proctoring Integrity Audit Log Card */}
      {proctorLogsList.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-2 text-red-400 font-extrabold border-b border-slate-850 pb-3">
            <ShieldAlert size={18} />
            <h3 className="text-base text-white">Proctoring Compliance Audit Logs</h3>
          </div>
          <p className="text-xs text-slate-400">
            The following compliance infractions were captured dynamically by the proctoring monitor during this mock interview session.
          </p>
          <div className="divide-y divide-slate-850">
            {proctorLogsList.map((log, idx) => {
              let typeColor = 'bg-slate-800 text-slate-400';
              if (log.type === 'NO_FACE') typeColor = 'bg-red-500/10 text-red-400 border border-red-500/20';
              else if (log.type === 'TAB_SWITCH' || log.type === 'FOCUS_LOSS') typeColor = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
              else if (log.type === 'LOOK_AWAY') typeColor = 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
              else if (log.type === 'MULTIPLE_FACES') typeColor = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
              else if (log.type === 'KEYBOARD_SHORTCUT') typeColor = 'bg-orange-500/10 text-orange-400 border border-orange-500/20';

              return (
                <div key={idx} className="py-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${typeColor}`}>
                        {log.type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-300 font-semibold">{log.details}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Audit Transcript Section */}
      <div className="space-y-4">
        <h3 className="font-extrabold text-xl text-white pl-1">Detailed Interview Transcript</h3>
        
        <div className="space-y-6">
          {qna.map((item, idx) => (
            <div key={idx} className="glass-panel p-6 rounded-2xl space-y-5">
              {/* Question */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-primary-400 uppercase font-extrabold">Question {idx + 1}</span>
                <h4 className="font-bold text-white text-base leading-snug">{item.question.question_text}</h4>
              </div>

              {/* Answer */}
              <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-xl space-y-1.5">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Your Answer</span>
                <p className="text-xs text-slate-300 leading-relaxed italic">
                  "{item.response?.response_text || 'No response recorded.'}"
                </p>
              </div>

              {/* Individual Question Feedback */}
              {item.response && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-start pt-2">
                  <div className="sm:col-span-3 space-y-1.5">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">AI Response Evaluation</span>
                    <p className="text-xs text-slate-350 leading-relaxed">{item.response.feedback}</p>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl text-center space-y-1">
                    <span className="text-[9px] text-slate-500 uppercase font-semibold block">Question Score</span>
                    <span className="text-base font-extrabold text-primary-400">{item.response.score}%</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Feedback Submission Section - Hidden in print */}
      <div className="glass-panel p-6 rounded-2xl space-y-6 print:hidden">
        <h3 className="font-bold text-lg text-white border-b border-slate-850 pb-3">Submit Mock Assessment Feedback</h3>
        
        {feedbackSubmitted ? (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl flex items-center gap-2 font-semibold">
            <ThumbsUp size={18} />
            <span>Thank you! Your feedback has been submitted successfully to improve the AI evaluations.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmitFeedback} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Rate this interview (1-5 Stars)</label>
                <select
                  className="w-full glass-input text-sm cursor-pointer"
                  value={rating}
                  onChange={(e) => setRating(parseInt(e.target.value))}
                >
                  <option value="5">★★★★★ (5 - Excellent)</option>
                  <option value="4">★★★★☆ (4 - Good)</option>
                  <option value="3">★★★☆☆ (3 - Average)</option>
                  <option value="2">★★☆☆☆ (2 - Poor)</option>
                  <option value="1">★☆☆☆☆ (1 - Very Bad)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Report any issues (e.g. mic lag, wrong transcription)</label>
                <input
                  type="text"
                  className="w-full glass-input text-sm"
                  placeholder="e.g. The whisper conversion missed a word."
                  value={issuesReported}
                  onChange={(e) => setIssuesReported(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Review Remarks</label>
              <textarea
                className="w-full glass-input text-sm min-h-20"
                placeholder="Share your thoughts about this mock session..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={feedbackLoading}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"
              >
                {feedbackLoading ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ReportDetailPage;
