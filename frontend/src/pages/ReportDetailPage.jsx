import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card, { CardTitle } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import {
  Award,
  BookOpen,
  Calendar,
  ChevronLeft,
  Printer,
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
      <Card className="text-center max-w-md mx-auto">
        <Spinner size="md" label="Loading performance report..." />
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="text-center max-w-md mx-auto space-y-4">
        <AlertCircle className="mx-auto text-red-400" size={32} />
        <h3 className="font-bold text-lg text-slate-900 dark:text-white">Error Loading Report</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">{error || 'Report details could not be found.'}</p>
        <Link to="/dashboard">
          <Button size="sm">Back to Dashboard</Button>
        </Link>
      </Card>
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

  const getLogBadgeVariant = (type) => {
    if (type === 'NO_FACE') return 'error';
    if (type === 'TAB_SWITCH' || type === 'FOCUS_LOSS') return 'info';
    if (type === 'LOOK_AWAY') return 'warning';
    if (type === 'MULTIPLE_FACES') return 'primary';
    if (type === 'KEYBOARD_SHORTCUT') return 'warning';
    return 'default';
  };

  const scoreColor =
    report.overall_score >= 80
      ? 'text-emerald-600 dark:text-emerald-400'
      : report.overall_score >= 60
        ? 'text-primary-600 dark:text-primary-400'
        : 'text-amber-600 dark:text-amber-400';

  return (
    <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto animate-fade-in print:max-w-none print:space-y-4 print:text-black print:bg-white">
      {/* Print-only header */}
      <div className="hidden print:block print:mb-6 print:pb-4 print:border-b print:border-slate-300">
        <h1 className="text-2xl font-bold text-black capitalize">
          {interview.job_role} — Interview Scorecard
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Completed on {new Date(interview.created_at).toLocaleDateString()} · {interview.type} · {interview.difficulty}
        </p>
      </div>

      {/* Navigation — hidden in print */}
      <div className="no-print flex items-center justify-between gap-4">
        <Link
          to="/history"
          className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition text-sm"
        >
          <ChevronLeft size={16} />
          Back to History
        </Link>

        <Button variant="secondary" size="sm" icon={Printer} onClick={handlePrint}>
          Print / Export PDF
        </Button>
      </div>

      {/* Proctoring failure alert */}
      {interview.is_proctor_failed && (
        <div className="space-y-6 print:break-inside-avoid">
          <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 dark:text-red-400 text-sm flex items-start gap-3">
            <ShieldAlert size={20} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Session Terminated due to Proctor Violations</h3>
              <p className="text-xs leading-relaxed opacity-90">
                This interview mock session was automatically shut down because the candidate accumulated 3 or more proctoring compliance infractions. The scorecard ratings are voided.
              </p>
            </div>
          </div>

          {report.snapshot_image && (
            <Card className="border-red-500/20 bg-red-50 dark:bg-red-950/5 print:bg-white print:border-red-300">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <div className="md:col-span-1 relative aspect-video rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <img
                    src={report.snapshot_image}
                    alt="Integrity Breach Frame Snapshot"
                    className="w-full h-full object-cover print:max-h-48"
                  />
                  <Badge variant="error" className="absolute top-2 left-2 !text-[8px]">
                    Violation Snapshot
                  </Badge>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Incident Evidence File</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {report.snapshot_description || 'No screenshot description was logged by the system proctoring engine.'}
                  </p>
                  <div className="p-3 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-600 dark:text-slate-400 print:bg-slate-50 print:border-slate-300">
                    <span className="font-bold text-red-500 dark:text-red-400">Compliance Audit:</span>{' '}
                    A copy of this report card and visual evidence has been transmitted to administrative monitoring. Re-offending 3 times will lock your account.
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Main stats header */}
      <Card className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden print:break-inside-avoid print:shadow-none">
        <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-primary-500/10 rounded-full blur-3xl pointer-events-none print:hidden" />

        <div className="space-y-2 relative">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="primary" size="lg" className="capitalize !normal-case">
              {interview.type} Prep
            </Badge>
            <Badge variant="default" size="lg" className="!normal-case">
              {interview.difficulty}
            </Badge>
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white capitalize leading-tight print:text-black">
            {interview.job_role} Scorecard
          </h1>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-500 print:text-slate-600">
            <Calendar size={14} />
            <span>Completed on {new Date(interview.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950/60 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl shrink-0 print:bg-white print:border-slate-300">
          <div className="text-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold print:text-slate-600">
              Overall Assessment
            </span>
            <span className={`text-4xl font-black block mt-1 print:text-black ${scoreColor}`}>
              {report.overall_score}%
            </span>
          </div>
          <div className="p-3 bg-primary-500/10 border border-primary-500/20 text-primary-500 dark:text-primary-400 rounded-xl print:border-slate-300 print:text-slate-700">
            <Award size={24} />
          </div>
        </div>
      </Card>

      {/* Sub-scores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 print:grid-cols-2 print:gap-3">
        {subScores.map((score, idx) => (
          <Card key={idx} className="space-y-3 print:break-inside-avoid print:shadow-none print:p-4">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block print:text-slate-600">
              {score.name}
            </span>
            <span className="text-xl font-extrabold text-slate-900 dark:text-white print:text-black">
              {score.score}%
            </span>
            <div className="w-full bg-slate-200 dark:bg-slate-900 h-2 rounded-full overflow-hidden print:bg-slate-200">
              <div
                className={`bg-gradient-to-r ${score.color} h-full rounded-full transition-all duration-500 print:bg-slate-700`}
                style={{ width: `${score.score}%` }}
              />
            </div>
          </Card>
        ))}
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 print:grid-cols-2 print:gap-4">
        <Card className="space-y-4 print:break-inside-avoid print:shadow-none">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold border-b border-slate-200 dark:border-slate-800 pb-3 print:border-slate-300 print:text-emerald-700">
            <ThumbsUp size={18} />
            <h4>Identified Strengths</h4>
          </div>
          <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300 print:text-black">
            {strengths.length === 0 ? (
              <li className="text-slate-400 dark:text-slate-500">No strengths logged.</li>
            ) : (
              strengths.map((str, idx) => (
                <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                  <span>{str}</span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card className="space-y-4 print:break-inside-avoid print:shadow-none">
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400 font-bold border-b border-slate-200 dark:border-slate-800 pb-3 print:border-slate-300 print:text-red-700">
            <ThumbsDown size={18} />
            <h4>Areas for Improvement</h4>
          </div>
          <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300 print:text-black">
            {weaknesses.length === 0 ? (
              <li className="text-slate-400 dark:text-slate-500">No major weaknesses identified. Perfect!</li>
            ) : (
              weaknesses.map((weak, idx) => (
                <li key={idx} className="flex items-start gap-2.5 leading-relaxed">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-1.5 shrink-0" />
                  <span>{weak}</span>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      {/* Recommendations */}
      <Card className="space-y-6 print:break-inside-avoid print:shadow-none md:p-8">
        <div className="flex items-center gap-2.5 text-primary-500 dark:text-primary-400 font-bold border-b border-slate-200 dark:border-slate-800 pb-4 print:border-slate-300 print:text-slate-800">
          <BookOpen size={20} />
          <h3>AI Coach Recommendations</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block print:text-slate-600">
              Suggested Improvement Steps
            </span>
            <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap print:text-black">
              {report.recommendations || 'No specific improvements registered.'}
            </div>
          </div>

          <div className="p-5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider print:text-slate-600">
              <Info size={14} className="text-primary-500" />
              Missing Concepts
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed print:text-black">
              {report.missing_concepts || 'No missing technical concepts identified.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Proctor logs */}
      {proctorLogsList.length > 0 && (
        <Card className="space-y-4 print:break-inside-avoid print:shadow-none">
          <div className="flex items-center gap-2 text-red-500 dark:text-red-400 font-extrabold border-b border-slate-200 dark:border-slate-800 pb-3 print:border-slate-300">
            <ShieldAlert size={18} />
            <h3 className="text-base text-slate-900 dark:text-white print:text-black">Proctoring Compliance Audit Logs</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
            The following compliance infractions were captured dynamically by the proctoring monitor during this mock interview session.
          </p>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 print:divide-slate-300">
            {proctorLogsList.map((log, idx) => (
              <div key={idx} className="py-3.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs print:py-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={getLogBadgeVariant(log.type)} className="!text-[9px]">
                      {log.type.replace('_', ' ')}
                    </Badge>
                    <span className="text-[10px] text-slate-500 font-mono print:text-slate-600">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 font-semibold print:text-black">{log.details}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Transcript */}
      <div className="space-y-4 print:break-before-page">
        <h3 className="font-extrabold text-xl text-slate-900 dark:text-white pl-1 print:text-black print:text-lg">
          Detailed Interview Transcript
        </h3>

        <div className="space-y-4 md:space-y-6">
          {qna.map((item, idx) => (
            <Card key={idx} className="space-y-5 print:break-inside-avoid print:shadow-none print:p-4">
              <div className="space-y-1.5">
                <Badge variant="primary" className="!text-[10px]">Question {idx + 1}</Badge>
                <h4 className="font-bold text-slate-900 dark:text-white text-base leading-snug print:text-black">
                  {item.question.question_text}
                </h4>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1.5 print:bg-slate-50 print:border-slate-300">
                <span className="text-[10px] text-slate-500 uppercase font-semibold print:text-slate-600">Your Answer</span>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic print:text-black print:not-italic">
                  &ldquo;{item.response?.response_text || 'No response recorded.'}&rdquo;
                </p>
              </div>

              {item.response && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-start pt-2">
                  <div className="sm:col-span-3 space-y-1.5">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold print:text-slate-600">
                      AI Response Evaluation
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed print:text-black">
                      {item.response.feedback}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-1 print:bg-slate-50 print:border-slate-300">
                    <span className="text-[9px] text-slate-500 uppercase font-semibold block print:text-slate-600">
                      Question Score
                    </span>
                    <span className="text-base font-extrabold text-primary-500 dark:text-primary-400 print:text-black">
                      {item.response.score}%
                    </span>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Feedback — hidden in print */}
      <Card className="space-y-6 no-print">
        <CardTitle className="border-b border-slate-200 dark:border-slate-800 pb-3">
          Submit Mock Assessment Feedback
        </CardTitle>

        {feedbackSubmitted ? (
          <Alert variant="success" className="font-semibold">
            Thank you! Your feedback has been submitted successfully to improve the AI evaluations.
          </Alert>
        ) : (
          <form onSubmit={handleSubmitFeedback} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Rate this interview (1-5 Stars)
                </label>
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
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Report any issues (e.g. mic lag, wrong transcription)
                </label>
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
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Review Remarks</label>
              <textarea
                className="w-full glass-input text-sm min-h-20"
                placeholder="Share your thoughts about this mock session..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" loading={feedbackLoading} size="sm">
                {feedbackLoading ? 'Submitting...' : 'Submit Feedback'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
};

export default ReportDetailPage;
