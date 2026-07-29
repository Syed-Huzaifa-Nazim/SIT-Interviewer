import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { SlidersHorizontal, Play, Cpu, UserCircle2, BrainCircuit, FileSpreadsheet, Upload, Check, Coins, Clock } from 'lucide-react';

// Selectable question counts. Replaces the old range slider: a slider gives no sense of
// which values are available and is fiddly to hit precisely, while these read at a glance.
const QUESTION_CHOICES = [3, 4, 5, 6, 8, 10];

// Rough session length shown in the summary — ~3 minutes of speaking and thinking per
// question, which matches the per-question timers the backend sets.
const MINUTES_PER_QUESTION = 3;

const InterviewConfig = () => {
  const { user, tokens, setTokens } = useAuth();
  const navigate = useNavigate();

  const presetRoles = [
    'React Developer',
    'Python Developer',
    'Node.js Developer',
    'Database Administrator',
    'AI Engineer',
    'Machine Learning Engineer',
    'Full Stack Developer',
    'System Architect',
    'Custom'
  ];

  const initialRole = presetRoles.includes(user?.job_role) ? user?.job_role : (user?.job_role ? 'Custom' : 'React Developer');

  const [type, setType] = useState('technical');
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [customRoleText, setCustomRoleText] = useState(initialRole === 'Custom' ? user?.job_role : '');
  const [experienceLevel, setExperienceLevel] = useState(user?.experience_level || 'Mid');
  const [difficulty, setDifficulty] = useState('Medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [customJd, setCustomJd] = useState('');
  const [customSkills, setCustomSkills] = useState('');

  const [loading, setLoading] = useState(false);
  const [uploadingJd, setUploadingJd] = useState(false);
  const [jdFileName, setJdFileName] = useState('');
  const [error, setError] = useState('');
  const [domainNotice, setDomainNotice] = useState('');

  const handleJdFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setJdFileName(file.name);
    setUploadingJd(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/resume_jd/extract-file-text', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setCustomJd(res.data.text);
      setType('custom');
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to extract text from job description file.');
      setJdFileName('');
    } finally {
      setUploadingJd(false);
    }
  };

  const handleStart = async (e) => {
    e.preventDefault();
    setError('');
    setDomainNotice('');

    if (tokens?.tokens_available < 1) {
      setError('You do not have enough tokens. Please go to your Profile and purchase tokens to start.');
      return;
    }

    setLoading(true);

    try {
      const finalJobRole = selectedRole === 'Custom' ? customRoleText : selectedRole;
      const res = await api.post('/interviews/start', {
        type,
        job_role: finalJobRole || 'React Developer',
        experience_level: experienceLevel,
        difficulty,
        num_questions: numQuestions,
        custom_jd: type === 'custom' ? customJd : null,
        custom_skills: type === 'custom' ? customSkills : null
      });

      setTokens((prev) => ({
        ...prev,
        tokens_available: prev.tokens_available - 1,
        tokens_consumed: prev.tokens_consumed + 1
      }));

      const interviewId = res.data.interview.id;
      navigate(`/interview/setup/${interviewId}`);
    } catch (err) {
      // 422 = domain not supported (non-technical). Show it as a soft, friendly notice
      // rather than a hard error — no token is consumed in this case.
      if (err.response?.status === 422) {
        setDomainNotice(err.response?.data?.message || 'Interviews are not yet available for this domain.');
      } else {
        setError(err.response?.data?.message || 'Failed to start interview. Please check your credentials and connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const typesList = [
    { id: 'technical', name: 'Technical Mock', desc: 'Frameworks, programming logic, DBs, and systems coding.', icon: Cpu },
    { id: 'hr', name: 'HR Assessment', desc: 'Self introduction, communication style, and workplace ethics.', icon: UserCircle2 },
    { id: 'behavioral', name: 'Behavioral STAR', desc: 'STAR format situations, team leadership, conflict resolution.', icon: BrainCircuit },
    { id: 'custom', name: 'Custom Role Match', desc: 'Upload a specific JD to align questions with requirements.', icon: FileSpreadsheet }
  ];

  const finalRoleLabel = (selectedRole === 'Custom' ? customRoleText : selectedRole) || 'React Developer';
  const balanceAfter = Math.max(0, (tokens?.tokens_available ?? 0) - 1);
  const canStart = (tokens?.tokens_available ?? 0) >= 1;

  // The stepper is presentational: it reflects how far the form has been filled in rather
  // than gating anything, so the page still submits in a single action as it always did.
  const stepDone = {
    focus: !!type,
    details: !!finalRoleLabel && (type !== 'custom' || !!customJd.trim()),
  };

  const steps = [
    { id: 'focus', label: 'Focus', done: stepDone.focus },
    { id: 'details', label: 'Details', done: stepDone.details },
    { id: 'launch', label: 'Launch', done: false },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <PageHeader
        icon={SlidersHorizontal}
        title="Configure Mock Interview"
        subtitle="Configure parameters and launch your personalized mock interview. 1 token will be deducted."
      />

      {error && <Alert variant="error">{error}</Alert>}
      {domainNotice && <Alert variant="warning">{domainNotice}</Alert>}

      {/* Progress stepper — shows where you are in the setup at a glance. */}
      <div className="flex items-center">
        {steps.map((s, idx) => {
          const isActive = !s.done && (idx === 0 || steps[idx - 1].done);
          return (
            <React.Fragment key={s.id}>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold border transition ${
                    s.done
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : isActive
                        ? 'border-primary-500 text-primary-600 dark:text-primary-400 ring-4 ring-primary-500/15 bg-white dark:bg-slate-900'
                        : 'border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-600 bg-white dark:bg-slate-900'
                  }`}
                >
                  {s.done ? <Check size={13} strokeWidth={3} /> : idx + 1}
                </span>
                <span
                  className={`text-xs font-bold ${
                    s.done || isActive
                      ? 'text-slate-800 dark:text-slate-200'
                      : 'text-slate-400 dark:text-slate-600'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-px mx-3 min-w-4 ${
                    s.done ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-800'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <form onSubmit={handleStart}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
          {/* ---------------------------------------------------------- main column */}
          <div className="space-y-6">
          {/* Step 1: Select Type */}
          <Card className="space-y-4">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Interview Focus
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {typesList.map((t) => {
                const Icon = t.icon;
                const isSelected = type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    className={`relative p-4 rounded-xl text-left border flex items-start gap-3.5 transition-all duration-200 ${
                      isSelected
                        ? 'bg-primary-500/10 border-primary-500 ring-2 ring-primary-500/20 text-slate-900 dark:text-white'
                        : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-2.5 right-2.5 w-4.5 h-4.5 p-0.5 rounded-full bg-primary-600 text-white flex items-center justify-center">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                    <div
                      className={`p-2.5 rounded-lg shrink-0 ${
                        isSelected
                          ? 'bg-primary-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{t.name}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-normal">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Quick Job Description Upload */}
          <Card variant="highlighted" className="!p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200">
                  Fast-Track: Upload Job Description File
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Have a target job description (.pdf, .txt)? Upload it to instantly customize your mock questions!
                </p>
              </div>

              <div className="shrink-0">
                <input
                  type="file"
                  accept=".pdf,.txt"
                  onChange={handleJdFileUpload}
                  className="hidden"
                  id="quick-jd-upload"
                  disabled={uploadingJd}
                />
                <label
                  htmlFor="quick-jd-upload"
                  className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-white shadow-lg shadow-primary-600/25 transition-all duration-200 cursor-pointer ${uploadingJd ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <Upload size={14} className={uploadingJd ? 'animate-spin' : ''} />
                  <span>{uploadingJd ? 'Processing...' : 'Upload JD'}</span>
                </label>
              </div>
            </div>
            {jdFileName && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
                <Badge variant="success" size="lg">Loaded</Badge>
                <span className="text-slate-600 dark:text-slate-300 truncate max-w-md font-mono">{jdFileName}</span>
              </div>
            )}
          </Card>

          {/* Step 2: Details */}
          <Card className="space-y-5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Configure Details
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Target Job Role</label>
                <select
                  className="w-full glass-input text-sm cursor-pointer"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  required
                >
                  {presetRoles.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                {selectedRole === 'Custom' && (
                  <input
                    type="text"
                    className="w-full glass-input text-sm mt-2"
                    placeholder="Type in your target title..."
                    value={customRoleText}
                    onChange={(e) => setCustomRoleText(e.target.value)}
                    required
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Experience Level</label>
                <select
                  className="w-full glass-input text-sm cursor-pointer"
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                >
                  <option value="Entry">Entry Level (0-2 years)</option>
                  <option value="Mid">Mid Level (2-5 years)</option>
                  <option value="Senior">Senior Level (5+ years)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Interview Difficulty</label>
                <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-950/60 p-1 border border-slate-200 dark:border-slate-800 rounded-lg">
                  {['Easy', 'Medium', 'Hard'].map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setDifficulty(diff)}
                      className={`py-1.5 text-xs font-bold rounded-md transition ${
                        difficulty === diff
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Number of Questions
                </label>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {QUESTION_CHOICES.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setNumQuestions(count)}
                      aria-pressed={numQuestions === count}
                      className={`w-9 h-9 rounded-lg text-xs font-bold font-mono border transition ${
                        numQuestions === count
                          ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Custom fields */}
          {type === 'custom' && (
            <Card className="space-y-4">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Custom Job Context
              </label>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Job Description (Extracted/Pasted details)
                  </label>
                  <textarea
                    className="w-full glass-input text-sm min-h-28"
                    placeholder="Paste the job listing description here. The AI will extract requirements and formulate interview queries targeting these specific aspects..."
                    value={customJd}
                    onChange={(e) => setCustomJd(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Required Skills (Comma separated)
                  </label>
                  <input
                    type="text"
                    className="w-full glass-input text-sm"
                    placeholder="e.g. React, Redux Toolkit, Webpack, CSS grid"
                    value={customSkills}
                    onChange={(e) => setCustomSkills(e.target.value)}
                  />
                </div>
              </div>
            </Card>
          )}
          </div>

          {/* ------------------------------------------------------- summary rail */}
          <aside className="lg:sticky lg:top-4">
            <Card className="space-y-4">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Session Summary
              </h4>

              <dl className="space-y-0">
                {[
                  ['Focus', typesList.find((t) => t.id === type)?.name ?? '—'],
                  ['Role', finalRoleLabel],
                  ['Level', experienceLevel],
                  ['Difficulty', difficulty],
                  ['Questions', numQuestions],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-3 py-2 border-b border-dashed border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">{label}</dt>
                    <dd className="font-bold text-slate-800 dark:text-slate-200 text-right truncate">{value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 py-2 text-xs">
                  <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Clock size={12} /> Est. duration
                  </dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-200">
                    ~{numQuestions * MINUTES_PER_QUESTION} min
                  </dd>
                </div>
              </dl>

              {/* Cost is stated before the candidate commits, so the deduction is never a surprise. */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-primary-500/10 border border-primary-500/25">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Coins size={13} /> Token cost
                </span>
                <span className="text-xl font-extrabold text-primary-600 dark:text-primary-400">1</span>
              </div>

              <Button
                type="submit"
                size="lg"
                icon={Play}
                loading={loading}
                disabled={!canStart}
                fullWidth
              >
                {loading ? 'Generating Questions...' : 'Start Interview'}
              </Button>

              <p className="text-[11px] text-center text-slate-500 dark:text-slate-500">
                {canStart ? (
                  <>
                    Balance after start:{' '}
                    <span className="font-bold text-slate-700 dark:text-slate-300">{balanceAfter} tokens</span>
                  </>
                ) : (
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    No tokens left — top up from your Profile.
                  </span>
                )}
              </p>
            </Card>
          </aside>
        </div>
      </form>
    </div>
  );
};

export default InterviewConfig;
