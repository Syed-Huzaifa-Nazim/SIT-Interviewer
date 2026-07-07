import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card, { CardTitle } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { FileUp, FileCheck, Brain, ArrowRight, BookOpen, Layers } from 'lucide-react';

const ResumeJdAnalyzer = () => {
  const navigate = useNavigate();

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
      setError(err.response?.data?.message || 'Failed to parse resume file. Ensure it is a standard PDF or TXT.');
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

  // Launch customized interview targeting identified skill gaps
  const handlePracticeGaps = () => {
    if (!matchResult) return;
    
    // Pass custom parameters to config/session
    navigate('/interview/start', {
      state: {
        customJd: jdText,
        customSkills: matchResult.missing_skills.join(', '),
        prefillRole: 'React Developer',
        prefillType: 'custom'
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileCheck}
        title="Resume & JD Match Analyzer"
        subtitle="Review resume ATS compliance scores and compare candidate skills with job description profiles."
      />

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Card: Resume Upload & Analysis */}
        <div className="space-y-6">
          <Card className="space-y-6 relative overflow-hidden">
            <CardTitle>1. Upload PDF Resume</CardTitle>
            
            {analyzingResume && (
              <div className="absolute inset-0 bg-slate-100/80 dark:bg-slate-950/80 backdrop-blur-sm z-30 rounded-2xl flex flex-col items-center justify-center gap-3">
                <Spinner label="Extracting resume metadata..." />
              </div>
            )}

            {/* File Drag Drop Zone */}
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-primary-500/60 rounded-xl p-8 text-center bg-slate-50 dark:bg-slate-950/20 cursor-pointer relative group transition-colors">
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleResumeChange}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              <FileUp className="mx-auto text-slate-400 dark:text-slate-500 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors mb-3" size={32} />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {resumeFile ? resumeFile.name : 'Select or drop your PDF Resume'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Supports PDF and TXT formats up to 10MB</p>
            </div>

            {/* Resume Analysis Display */}
            {resumeAnalysis && (
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ATS Score CARD</span>
                  <span className="text-lg font-extrabold text-emerald-500 dark:text-emerald-400">{resumeAnalysis.resume_score}%</span>
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-900 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-500 dark:bg-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${resumeAnalysis.resume_score}%` }}
                  ></div>
                </div>

                {/* Parsed Skills */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Parsed Core Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {JSON.parse(resumeAnalysis.extracted_skills).map((skill, idx) => (
                      <Badge key={idx} variant="default" className="rounded-lg normal-case tracking-normal font-semibold">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Card: Job Description Matching Form */}
        <div className="space-y-6">
          <Card className="relative overflow-hidden flex flex-col justify-between min-h-[300px]">
            <form onSubmit={handleMatch} className="space-y-6 flex flex-col flex-1">
              <CardTitle>2. Match Job Description</CardTitle>

              {matching && (
                <div className="absolute inset-0 bg-slate-100/80 dark:bg-slate-950/80 backdrop-blur-sm z-30 rounded-2xl flex flex-col items-center justify-center gap-3">
                  <Spinner label="Calculating match coefficient..." />
                </div>
              )}

              <div className="space-y-1.5 flex-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Paste Job Listing Description</label>
                <textarea
                  className="w-full glass-input text-sm min-h-36 resize-none"
                  placeholder="Paste the target JD here. We will match parsed resume skills against it..."
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={!resumeAnalysis || !jdText.trim() || matching}
                loading={matching}
                fullWidth
                icon={Layers}
                className="mt-4"
              >
                Run Match Analysis
              </Button>
            </form>
          </Card>
        </div>

      </div>

      {/* Matching Results Drawer */}
      {matchResult && (
        <Card variant="highlighted" className="space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800 pb-6">
            <div className="flex items-center gap-2.5">
              <Brain className="text-primary-500 dark:text-primary-400" />
              <div>
                <CardTitle className="text-xl mb-0">Match Assessment Results</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Semantic audit comparing your experience with target criteria</p>
              </div>
            </div>

            {/* Score Ring */}
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Semantic Match</span>
              <span className={`text-2xl font-extrabold ${matchResult.match_percentage >= 75 ? 'text-emerald-500 dark:text-emerald-400' : matchResult.match_percentage >= 50 ? 'text-primary-500 dark:text-primary-400' : 'text-amber-500 dark:text-amber-400'}`}>
                {matchResult.match_percentage}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Matched & Missing Skills */}
            <div className="space-y-6">
              {/* Matched */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Matched Core Capabilities</span>
                <div className="flex flex-wrap gap-1.5">
                  {matchResult.matched_skills.map((skill, idx) => (
                    <Badge key={idx} variant="success" className="rounded-lg normal-case tracking-normal font-semibold">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Gaps */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Identified Skill Deficiencies</span>
                <div className="flex flex-wrap gap-1.5">
                  {matchResult.missing_skills.map((skill, idx) => (
                    <Badge key={idx} variant="error" className="rounded-lg normal-case tracking-normal font-semibold animate-pulse">
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
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actionable Upskilling Roadmap</span>
              </div>
              <ul className="space-y-2">
                {matchResult.suggestions.map((sug, idx) => (
                  <li key={idx} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-primary-500 rounded-full mt-1.5 shrink-0"></div>
                    <span>{sug}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Custom generated interview gaps questions */}
          <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">AI Custom Gaps Questions</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {matchResult.custom_questions.map((q, idx) => (
                <Card key={idx} className="p-4 space-y-2 text-xs" padding={false}>
                  <Badge variant="primary" className="rounded normal-case tracking-normal">Mock Question {idx + 1}</Badge>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">{q.question_text}</p>
                </Card>
              ))}
            </div>

            <div className="pt-4 flex justify-end">
              <Button
                onClick={handlePracticeGaps}
                icon={ArrowRight}
                iconPosition="right"
              >
                Launch Mock Interview targeting these gaps
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ResumeJdAnalyzer;
