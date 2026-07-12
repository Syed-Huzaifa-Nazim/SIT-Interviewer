import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { Sparkles, Play, Cpu, UserCircle2, BrainCircuit, FileSpreadsheet, Upload } from 'lucide-react';

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

  return (
    <div className="max-w-3xl mx-auto space-y-6 md:space-y-8 animate-fade-in">
      <PageHeader
        icon={Sparkles}
        title="Configure Mock Interview"
        subtitle="Configure parameters and launch your personalized mock interview. 1 token will be deducted."
      />

      {error && <Alert variant="error">{error}</Alert>}
      {domainNotice && <Alert variant="warning">{domainNotice}</Alert>}

      <Card className="space-y-8 md:p-8">
        <form onSubmit={handleStart} className="space-y-8">
          {/* Step 1: Select Type */}
          <div className="space-y-4">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-200 block">
              1. Select Interview Focus
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              {typesList.map((t) => {
                const Icon = t.icon;
                const isSelected = type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setType(t.id)}
                    className={`p-4 rounded-xl text-left border flex items-start gap-3.5 transition-all duration-200 ${
                      isSelected
                        ? 'bg-primary-500/10 border-primary-500 ring-2 ring-primary-500/20 text-slate-900 dark:text-white'
                        : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
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
          </div>

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
          <div className="space-y-5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">2. Configure Details</h3>

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
                  Number of Questions:{' '}
                  <span className="text-primary-500 dark:text-primary-400 font-bold">{numQuestions}</span>
                </label>
                <input
                  type="range"
                  min="3"
                  max="10"
                  className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary-500 mt-2"
                  value={numQuestions}
                  onChange={(e) => setNumQuestions(parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Custom fields */}
          {type === 'custom' && (
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">3. Custom Job Context</h3>

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
            </div>
          )}

          {/* Submit */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Current balance:{' '}
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {tokens?.tokens_available ?? 0} tokens
              </span>
            </p>

            <Button
              type="submit"
              size="lg"
              icon={Play}
              loading={loading}
              className="w-full sm:w-auto"
            >
              {loading ? 'Generating Questions...' : 'Deduct 1 Token & Start'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default InterviewConfig;
