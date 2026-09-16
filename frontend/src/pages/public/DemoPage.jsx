import React, { useState, useEffect } from 'react';
import PublicLayout from '../../layouts/PublicLayout';
import PageHero from './PageHero';
import Button from '../../components/ui/Button';
import { Monitor, Volume2, VolumeX, Brain, Send } from 'lucide-react';

/**
 * Interactive evaluation demo (extracted from the old landing anchor). Self-contained
 * simulation of the real-time evaluation flow.
 */
const DemoPage = () => {
  const [simStep, setSimStep] = useState(0);
  const [simAnswer, setSimAnswer] = useState('');
  const [simMuted, setSimMuted] = useState(false);
  const [simLog, setSimLog] = useState('');

  const startSim = () => {
    setSimStep(1);
    setSimLog('System is initializing context. Generating scenario...');
  };

  useEffect(() => {
    if (simStep === 1) {
      const timer = setTimeout(() => {
        setSimStep(2);
        setSimLog('Question generated. Microphone ready.');
        if ('speechSynthesis' in window && !simMuted) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance('Please explain the concept of Dependency Injection in software architecture.');
          u.rate = 0.9;
          window.speechSynthesis.speak(u);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [simStep, simMuted]);

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const submitSimAnswer = (e) => {
    e.preventDefault();
    if (!simAnswer.trim()) return;
    setSimStep(3);
    setSimLog('Analyzing transcript and technical accuracy...');
    setTimeout(() => {
      setSimStep(4);
      setSimLog('Evaluation complete. Assessment record updated.');
    }, 2500);
  };

  const resetSim = () => {
    setSimStep(0);
    setSimAnswer('');
    setSimLog('');
  };

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Evaluation Demo"
        title="Experience the Live Evaluator"
        subtitle="Try a self-contained simulation of our real-time technical evaluation engine — no account required."
      />
      <section className="max-w-2xl mx-auto px-6 py-20">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-6 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 mb-6">
            <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400">
              <Monitor size={18} />
              <span className="text-sm font-bold uppercase tracking-widest">Live Evaluator</span>
            </div>
            <button onClick={() => setSimMuted(!simMuted)} className="text-slate-400 hover:text-primary-600 transition">
              {simMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>

          {simStep === 0 && (
            <div className="py-12 text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 mx-auto flex items-center justify-center">
                <Brain size={32} />
              </div>
              <div>
                <h4 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Diagnostic Assessment</h4>
                <p className="text-sm text-slate-500 max-w-xs mx-auto">Experience our real-time technical evaluation simulation engine.</p>
              </div>
              <Button onClick={startSim} className="px-8">Initiate Sequence</Button>
            </div>
          )}

          {(simStep === 1 || simStep === 3) && (
            <div className="py-16 text-center space-y-4">
              <div className={`w-10 h-10 border-4 ${simStep === 1 ? 'border-primary-600' : 'border-accent-500'} border-t-transparent rounded-full mx-auto animate-spin`} />
              <span className="text-sm font-medium text-slate-500 block">{simLog}</span>
            </div>
          )}

          {simStep === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-5 bg-slate-50 dark:bg-slate-900 rounded-lg border-l-4 border-primary-600">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Prompt:</span>
                <p className="text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                  "Please explain the concept of Dependency Injection in software architecture."
                </p>
              </div>
              <form onSubmit={submitSimAnswer} className="space-y-4">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Candidate Response:</label>
                <textarea
                  className="text-sm min-h-[100px] resize-none w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Dependency Injection is a design pattern..."
                  value={simAnswer}
                  onChange={(e) => setSimAnswer(e.target.value)}
                  required
                />
                <div className="flex justify-end items-center pt-2">
                  <Button type="submit" size="sm" icon={Send}>Submit</Button>
                </div>
              </form>
            </div>
          )}

          {simStep === 4 && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <h4 className="font-bold text-slate-900 dark:text-white">Performance Metrics</h4>
                <span className="px-3 py-1 bg-accent-100 text-accent-800 dark:bg-accent-900/30 dark:text-accent-400 rounded-full text-xs font-bold">PASS (88%)</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[['Technical', '92%'], ['Clarity', '85%'], ['Relevance', '88%']].map(([label, val]) => (
                  <div key={label} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    <span className="text-xs text-slate-500 font-semibold block mb-1">{label}</span>
                    <span className="text-xl font-bold text-primary-600 dark:text-primary-400">{val}</span>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                <span className="text-xs font-bold text-primary-800 dark:text-primary-300 uppercase tracking-widest block mb-2">Feedback:</span>
                <p className="text-sm text-primary-900 dark:text-primary-100 leading-relaxed">
                  Solid understanding of architectural patterns. You correctly explained Inversion of Control (IoC) and its benefits.
                </p>
              </div>
              <Button variant="secondary" fullWidth onClick={resetSim}>Run Again</Button>
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
};

export default DemoPage;
