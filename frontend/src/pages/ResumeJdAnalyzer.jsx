import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card, { CardTitle } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { FileUp, FileCheck, Brain, ArrowRight, BookOpen, Layers, Check } from 'lucide-react';

/**
 * Coerce an API list field into a real array, whatever shape it arrives in.
 *
 * These fields are stored in TEXT columns, so they come back as a JSON string on the mock
 * path and — before the backend normalised them — as a Python-style "['a', 'b']" string on
 * the live-LLM path. A bare JSON.parse() threw on the latter, and because that happened
 * during render it took the whole page down to a blank screen. Parsing defensively here
 * means malformed data degrades to an empty list instead of unmounting the app.
 */
const toList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    return parsed == null ? [] : [parsed];
  } catch {
    // Python-style single-quoted list, e.g. "['React', 'Node']".
    try {
      const parsed = JSON.parse(value.replace(/'/g, '"'));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to the plain-text reading below.
    }
    return [value];
  }
};

// Circumference of the r=31 progress rings, so a percentage maps to a dash offset.
const RING_LEN = 2 * Math.PI * 31;
const ringOffset = (pct) => RING_LEN - (RING_LEN * Math.min(Math.max(pct, 0), 100)) / 100;

const ResumeJdAnalyzer = () => {
  const navigate = useNavigate();
  const { user, tokens, setTokens } = useAuth();

  const [launchingGaps, setLaunchingGaps] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const [jdText, setJdText] = useState('');
  const [resumeText, setResumeText] = useState(''); // Text representation of parsed resume

  const [analyzingResume, setAnalyzingResume] = useState(false);
  const [matching, setMatching] = useState(false);
  const [resumeAnalysis, setResumeAnalysis] = useState(null);
  const [matchResult, setMatchResult] = useState(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handle Resume File Upload & Local Analysis
  const handleResumeChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setResumeFile(file);
    setAnalyzingResume(true);
    setError('');
    setSuccess('');
    setResumeAnalysis(null);

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const res = await api.post('/resume-jd/analyze-resume', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const analysisData = res.data.analysis;
      setResumeAnalysis(analysisData);

      // Store parsed skills/experience as text to perform matching later
      const parsedText = `
        Skills: ${analysisData.extracted_skills}
        Experience: ${analysisData.extracted_experience}
        Education: ${analysisData.extracted_education}
      `;
      setResumeText(parsedText);
      setSuccess('Resume analyzed successfully! You can now paste a job description to check compatibility.');
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.message || 'Failed to parse resume file. Ensure it is a standard PDF or TXT.');
      setResumeFile(null);
    } finally {
      setAnalyzingResume(false);
    }
  };

  // Handle Match Analysis
  const handleMatch = async (e) => {
    e.preventDefault();
    if (!resumeText || !jdText.trim()) {
      setError('Please upload a resume first and paste a job description.');
      return;
    }

    setMatching(true);
    setError('');
    setMatchResult(null);

    try {
      const res = await api.post('/resume-jd/match', {
        resume_text: resumeText,
        jd_text: jdText
      });
      setMatchResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to match profile against job description.');
    } finally {
      setMatching(false);
    }
  };

  /**
   * Launch a customised interview targeting the identified skill gaps.
   *
   * This used to navigate to /interview/start carrying the JD and gaps in router state —
   * but InterviewConfig never read that state, so everything was silently dropped and the
   * candidate landed on an empty configuration form. The button promised a launch and
   * delivered a blank page.
   *
   * It now creates the interview itself, exactly the way InterviewConfig does, and goes
   * straight to the session setup. NOTE: this consumes 1 token on click, the same as
   * pressing Start on the configuration page.
   */
  const handlePracticeGaps = async () => {
    if (!matchResult || launchingGaps) return;

    setError('');

    if ((tokens?.tokens_available ?? 0) < 1) {
      setError('You do not have enough tokens. Please go to your Profile and purchase tokens to start.');
      return;
    }

    setLaunchingGaps(true);

    try {
      const res = await api.post('/interviews/start', {
        type: 'custom',
        job_role: user?.job_role || 'Software Engineer',
        experience_level: user?.experience_level || 'Mid',
        difficulty: 'Medium',
        num_questions: 5,
        custom_jd: jdText,
        custom_skills: toList(matchResult.missing_skills).join(', '),
      });

      setTokens((prev) => ({
        ...prev,
        tokens_available: prev.tokens_available - 1,
        tokens_consumed: prev.tokens_consumed + 1,
      }));

      navigate(`/interview/setup/${res.data.interview.id}`);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.message ||
          'Could not start the interview. Please try again.'
      );
      setLaunchingGaps(false);
    }
  };

  // Which of the three steps the user has reached — drives the flow indicator only.
  const flowSteps = [
    { id: 'upload', label: 'Upload resume', hint: 'PDF or TXT', done: !!resumeAnalysis },
    { id: 'jd', label: 'Paste the JD', hint: 'Target role', done: !!jdText.trim() },
    { id: 'review', label: 'Review match', hint: 'Gaps & questions', done: !!matchResult },
  ];

  const atsScore = Number(resumeAnalysis?.resume_score) || 0;
  const matchPct = Number(matchResult?.match_percentage) || 0;

  const matchTone =
    matchPct >= 75
      ? 'text-emerald-500 dark:text-emerald-400'
      : matchPct >= 50
        ? 'text-primary-500 dark:text-primary-400'
        : 'text-amber-500 dark:text-amber-400';

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileCheck}
        title="Resume & JD Match Analyzer"
        subtitle="Review resume ATS compliance scores and compare candidate skills with job description profiles."
      />

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* Flow indicator — makes the three-part process obvious before anything is filled in. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {flowSteps.map((step, idx) => {
          const isActive = !step.done && (idx === 0 || flowSteps[idx - 1].done);
          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition ${
                isActive
                  ? 'border-primary-500 bg-primary-500/5'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
                  step.done
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {step.done ? <Check size={12} strokeWidth={3} /> : idx + 1}
              </span>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{step.label}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{step.hint}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Left Card: Resume Upload & Analysis */}
        <Card className="space-y-5 relative overflow-hidden">
          {analyzingResume && (
            <div className="absolute inset-0 bg-slate-100/80 dark:bg-slate-950/80 backdrop-blur-sm z-30 rounded-2xl flex flex-col items-center justify-center gap-3">
              <Spinner label="Extracting resume metadata..." />
            </div>
          )}

          {/* Upload zone — switches to a compact confirmation row once a file is parsed. */}
          <div
            className={`relative rounded-xl border-2 transition-colors cursor-pointer group ${
              resumeAnalysis
                ? 'border-solid border-emerald-500/40 bg-emerald-500/5 p-4 flex items-center gap-3.5'
                : 'border-dashed border-slate-300 dark:border-slate-800 hover:border-primary-500/60 bg-slate-50 dark:bg-slate-950/20 p-8 text-center'
            }`}
          >
            <input
              type="file"
              accept=".pdf,.txt"
              onChange={handleResumeChange}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
            />

            {resumeAnalysis ? (
              <>
                <FileCheck className="text-emerald-500 dark:text-emerald-400 shrink-0" size={22} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                    {resumeFile?.name || 'Resume uploaded'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Parsed successfully — click to replace
                  </p>
                </div>
                <Badge variant="success" size="sm">Analysed</Badge>
              </>
            ) : (
              <>
                <FileUp
                  className="mx-auto text-slate-400 dark:text-slate-500 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors mb-3"
                  size={32}
                />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {resumeFile ? resumeFile.name : 'Select or drop your PDF Resume'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Supports PDF and TXT formats up to 10MB</p>
              </>
            )}
          </div>

          {/* Resume Analysis Display */}
          {resumeAnalysis && (
            <>
              {/* ATS score as a ring — a single number reads faster than a flat bar. */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                <div className="relative w-[74px] h-[74px] shrink-0">
                  <svg width="74" height="74" viewBox="0 0 74 74" className="-rotate-90">
                    <circle cx="37" cy="37" r="31" fill="none" strokeWidth="7" className="stroke-slate-200 dark:stroke-slate-800" />
                    <circle
                      cx="37"
                      cy="37"
                      r="31"
                      fill="none"
                      strokeWidth="7"
                      strokeLinecap="round"
                      className="stroke-emerald-500 dark:stroke-emerald-400 transition-[stroke-dashoffset] duration-700"
                      strokeDasharray={RING_LEN}
                      strokeDashoffset={ringOffset(atsScore)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-extrabold font-mono text-slate-900 dark:text-white">{atsScore}</span>
                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">ATS</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {atsScore >= 80
                      ? 'Strong ATS compliance'
                      : atsScore >= 60
                        ? 'Reasonable ATS compliance'
                        : 'Needs ATS work'}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    Scored on section clarity and how cleanly the document parses.
                  </p>
                </div>
              </div>

              {/* Parsed Skills */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Parsed Core Skills
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {toList(resumeAnalysis.extracted_skills).map((skill, idx) => (
                    <Badge key={idx} variant="default" className="rounded-lg normal-case tracking-normal font-semibold">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Right Card: Job Description Matching Form */}
        <Card className="relative overflow-hidden flex flex-col justify-between min-h-[300px]">
          <form onSubmit={handleMatch} className="space-y-5 flex flex-col flex-1">
            <CardTitle>Match Job Description</CardTitle>

            {matching && (
              <div className="absolute inset-0 bg-slate-100/80 dark:bg-slate-950/80 backdrop-blur-sm z-30 rounded-2xl flex flex-col items-center justify-center gap-3">
                <Spinner label="Calculating match coefficient..." />
              </div>
            )}

            <div className="space-y-1.5 flex-1 flex flex-col">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Paste Job Listing Description
              </label>
              <textarea
                className="w-full glass-input text-sm flex-1 min-h-36 resize-none"
                placeholder="Paste the target JD here. We will match parsed resume skills against it..."
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                required
              />
              {!resumeAnalysis && (
                <p className="text-[11px] text-slate-500 dark:text-slate-500 pt-1">
                  Upload a resume first to enable matching.
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={!resumeAnalysis || !jdText.trim() || matching}
              loading={matching}
              fullWidth
              icon={Layers}
            >
              Run Match Analysis
            </Button>
          </form>
        </Card>

      </div>

      {/* Matching Results */}
      {matchResult && (
        <Card variant="highlighted" className="space-y-7">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800 pb-6">
            <div className="flex items-center gap-2.5">
              <Brain className="text-primary-500 dark:text-primary-400" />
              <div>
                <CardTitle className="text-xl mb-0">Match Assessment Results</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Semantic audit comparing your experience with target criteria
                </p>
              </div>
            </div>

            {/* Match score ring */}
            <div className="relative w-[74px] h-[74px] shrink-0">
              <svg width="74" height="74" viewBox="0 0 74 74" className="-rotate-90">
                <circle cx="37" cy="37" r="31" fill="none" strokeWidth="7" className="stroke-slate-200 dark:stroke-slate-800" />
                <circle
                  cx="37"
                  cy="37"
                  r="31"
                  fill="none"
                  strokeWidth="7"
                  strokeLinecap="round"
                  stroke="currentColor"
                  className={`${matchTone} transition-[stroke-dashoffset] duration-700`}
                  strokeDasharray={RING_LEN}
                  strokeDashoffset={ringOffset(matchPct)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-lg font-extrabold font-mono ${matchTone}`}>{matchPct}</span>
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">MATCH</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Matched & Missing Skills */}
            <div className="space-y-6">
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Matched Core Capabilities
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {toList(matchResult.matched_skills).map((skill, idx) => (
                    <Badge key={idx} variant="success" className="rounded-lg normal-case tracking-normal font-semibold">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  Identified Skill Deficiencies
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {toList(matchResult.missing_skills).map((skill, idx) => (
                    <Badge key={idx} variant="error" className="rounded-lg normal-case tracking-normal font-semibold">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Suggestions & Actionable Items */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <BookOpen className="text-primary-500 dark:text-primary-400" size={18} />
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Actionable Upskilling Roadmap
                </span>
              </div>
              <ol className="space-y-2.5">
                {toList(matchResult.suggestions).map((sug, idx) => (
                  <li key={idx} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-md bg-primary-500/10 text-primary-600 dark:text-primary-400 text-[10px] font-extrabold flex items-center justify-center shrink-0 mt-px">
                      {idx + 1}
                    </span>
                    <span>{sug}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Custom generated interview gaps questions */}
          <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              AI Custom Gaps Questions
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {toList(matchResult.custom_questions).map((q, idx) => (
                <Card key={idx} className="p-4 space-y-2 text-xs" padding={false}>
                  <Badge variant="primary" className="rounded normal-case tracking-normal">Question {idx + 1}</Badge>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">
                    {typeof q === 'string' ? q : q?.question_text}
                  </p>
                </Card>
              ))}
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-end gap-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Starts immediately · uses 1 token
              </p>
              <Button
                onClick={handlePracticeGaps}
                loading={launchingGaps}
                disabled={launchingGaps}
                icon={ArrowRight}
                iconPosition="right"
              >
                {launchingGaps ? 'Starting Interview...' : 'Launch Mock Interview targeting these gaps'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ResumeJdAnalyzer;
