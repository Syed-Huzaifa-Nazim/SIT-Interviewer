import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { FileUp, Sparkles, AlertCircle, FileCheck, Brain, ArrowRight, BookOpen, Layers } from 'lucide-react';

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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white flex items-center gap-2.5">
          <FileCheck className="text-primary-500" />
          Resume & JD Match Analyzer
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Review resume ATS compliance scores and compare candidate skills with job description profiles.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2.5">
          <AlertCircle className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-start gap-2.5">
          <FileCheck className="text-emerald-500 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Card: Resume Upload & Analysis */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-6 relative overflow-hidden">
            <h3 className="font-bold text-lg text-white">1. Upload PDF Resume</h3>
            
            {analyzingResume && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-30 rounded-2xl flex flex-col items-center justify-center gap-3">
                <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
                <span className="text-sm font-semibold text-slate-350">Extracting resume metadata...</span>
              </div>
            )}

            {/* File Drag Drop Zone */}
            <div className="border-2 border-dashed border-slate-800 hover:border-primary-500/60 rounded-xl p-8 text-center bg-slate-950/20 cursor-pointer relative group transition-colors">
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleResumeChange}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              <FileUp className="mx-auto text-slate-500 group-hover:text-primary-400 transition-colors mb-3" size={32} />
              <p className="text-sm font-bold text-slate-300">
                {resumeFile ? resumeFile.name : 'Select or drop your PDF Resume'}
              </p>
              <p className="text-xs text-slate-500 mt-1">Supports PDF and TXT formats up to 10MB</p>
            </div>

            {/* Resume Analysis Display */}
            {resumeAnalysis && (
              <div className="space-y-4 pt-4 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">ATS Score CARD</span>
                  <span className="text-lg font-extrabold text-emerald-400">{resumeAnalysis.resume_score}%</span>
                </div>

                <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${resumeAnalysis.resume_score}%` }}
                  ></div>
                </div>

                {/* Parsed Skills */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Parsed Core Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {JSON.parse(resumeAnalysis.extracted_skills).map((skill, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-slate-900 border border-slate-850 rounded-lg text-xs text-slate-300">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Job Description Matching Form */}
        <div className="space-y-6">
          <form onSubmit={handleMatch} className="glass-panel p-6 rounded-2xl space-y-6 relative overflow-hidden flex flex-col justify-between min-h-[300px]">
            <h3 className="font-bold text-lg text-white">2. Match Job Description</h3>

            {matching && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-30 rounded-2xl flex flex-col items-center justify-center gap-3">
                <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
                <span className="text-sm font-semibold text-slate-350">Calculating match coefficient...</span>
              </div>
            )}

            <div className="space-y-1.5 flex-1">
              <label className="text-xs font-semibold text-slate-400">Paste Job Listing Description</label>
              <textarea
                className="w-full glass-input text-sm min-h-36 resize-none"
                placeholder="Paste the target JD here. We will match parsed resume skills against it..."
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={!resumeAnalysis || !jdText.trim() || matching}
              className="w-full py-3 bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-650 text-sm font-bold rounded-xl shadow-lg shadow-primary-600/35 flex items-center justify-center gap-2 transition disabled:opacity-50 mt-4"
            >
              <Layers size={16} />
              <span>Run Match Analysis</span>
            </button>
          </form>
        </div>

      </div>

      {/* Matching Results Drawer */}
      {matchResult && (
        <div className="glass-panel p-6 md:p-8 rounded-2xl space-y-8 border border-primary-500/30 shadow-xl shadow-primary-500/5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-b border-slate-900 pb-6">
            <div className="flex items-center gap-2.5">
              <Brain className="text-primary-400" />
              <div>
                <h3 className="font-extrabold text-xl text-white">Match Assessment Results</h3>
                <p className="text-xs text-slate-500 mt-0.5">Semantic audit comparing your experience with target criteria</p>
              </div>
            </div>

            {/* Score Ring */}
            <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800 px-4 py-2.5 rounded-xl">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Semantic Match</span>
              <span className={`text-2xl font-extrabold ${matchResult.match_percentage >= 75 ? 'text-emerald-400' : matchResult.match_percentage >= 50 ? 'text-primary-400' : 'text-amber-400'}`}>
                {matchResult.match_percentage}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Matched & Missing Skills */}
            <div className="space-y-6">
              {/* Matched */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-450 uppercase tracking-wider block">Matched Core Capabilities</span>
                <div className="flex flex-wrap gap-1.5">
                  {matchResult.matched_skills.map((skill, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-lg">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Gaps */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-450 uppercase tracking-wider block">Identified Skill Deficiencies</span>
                <div className="flex flex-wrap gap-1.5">
                  {matchResult.missing_skills.map((skill, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold rounded-lg animate-pulse-slow">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Suggestions & Actionable Items */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <BookOpen className="text-primary-400" size={18} />
                <span className="text-xs font-bold text-slate-450 uppercase tracking-wider block">Actionable Upskilling Roadmap</span>
              </div>
              <ul className="space-y-2">
                {matchResult.suggestions.map((sug, idx) => (
                  <li key={idx} className="text-xs text-slate-300 leading-relaxed flex items-start gap-2">
                    <div className="w-1.5 h-1.5 bg-primary-450 rounded-full mt-1.5 shrink-0"></div>
                    <span>{sug}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Custom generated interview gaps questions */}
          <div className="space-y-4 pt-6 border-t border-slate-900">
            <span className="text-xs font-bold text-slate-450 uppercase tracking-wider block">AI Custom Gaps Questions</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {matchResult.custom_questions.map((q, idx) => (
                <div key={idx} className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl space-y-2 text-xs">
                  <span className="font-bold text-[10px] uppercase text-primary-400">Mock Question {idx + 1}</span>
                  <p className="text-slate-300 leading-relaxed truncate-3-lines">{q.question_text}</p>
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={handlePracticeGaps}
                className="px-6 py-3.5 bg-primary-600 hover:bg-primary-700 text-sm font-bold text-white rounded-xl shadow-lg shadow-primary-600/20 flex items-center gap-2 transition"
              >
                <span>Launch Mock Interview targeting these gaps</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeJdAnalyzer;
