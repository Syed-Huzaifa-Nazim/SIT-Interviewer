import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import {
  Play, Send, RotateCcw, Terminal, Code2, CheckCircle2, XCircle,
  Clock3, AlertTriangle, ChevronLeft, ListChecks, Loader2,
} from 'lucide-react';

const LANGUAGES = [
  { id: 'python', label: 'Python 3' },
  { id: 'javascript', label: 'JavaScript (Node)' },
];

const DIFFICULTY_STYLES = {
  Easy: 'success',
  Medium: 'warning',
  Hard: 'error',
};

// --- Dependency-free line-numbered code editor ---------------------------------
const CodeEditor = ({ value, onChange, onRun, disabled }) => {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const lineCount = value.split('\n').length;

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e) => {
    // Ctrl/Cmd+Enter runs the sample tests (§12 IDE convenience).
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!disabled && onRun) onRun();
      return;
    }
    // Insert 4 spaces on Tab instead of moving focus.
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart, selectionEnd } = e.target;
      const next = value.substring(0, selectionStart) + '    ' + value.substring(selectionEnd);
      onChange(next);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = selectionStart + 4;
        }
      });
    }
  };

  return (
    <div className="flex flex-1 min-h-[340px] bg-slate-950 overflow-hidden">
      <div
        ref={gutterRef}
        className="select-none overflow-hidden py-4 px-3 text-right font-mono text-xs leading-relaxed text-slate-600 bg-slate-900/60 border-r border-slate-800"
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="flex-1 w-full bg-slate-950 p-4 font-mono text-sm text-slate-100 border-none outline-none focus:ring-0 resize-none leading-relaxed"
        style={{ tabSize: 4 }}
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
      />
    </div>
  );
};

// --- Per-test-case result row --------------------------------------------------
const statusMeta = {
  passed: { icon: CheckCircle2, variant: 'success', label: 'Passed', color: 'text-emerald-500' },
  failed: { icon: XCircle, variant: 'error', label: 'Failed', color: 'text-red-500' },
  timeout: { icon: Clock3, variant: 'warning', label: 'Timed out', color: 'text-amber-500' },
  error: { icon: AlertTriangle, variant: 'warning', label: 'Error', color: 'text-amber-500' },
};

const TestResultRow = ({ result }) => {
  const meta = statusMeta[result.status] || statusMeta.error;
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={15} className={meta.color} />
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {result.hidden ? `Hidden test #${result.index}` : `Sample test #${result.index}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {typeof result.runtime_ms === 'number' && (
            <span className="text-slate-400 dark:text-slate-500">{result.runtime_ms} ms</span>
          )}
          <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
        </div>
      </div>

      {!result.hidden && (result.input !== undefined) && (
        <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
          <div><span className="text-slate-400 dark:text-slate-500">Input:</span> {result.input}</div>
          <div><span className="text-slate-400 dark:text-slate-500">Expected:</span> {JSON.stringify(result.expected)}</div>
          {result.status === 'failed' && (
            <div className="text-red-500 dark:text-red-400">
              <span className="text-slate-400 dark:text-slate-500">Got:</span> {JSON.stringify(result.actual)}
            </div>
          )}
        </div>
      )}
      {result.error && (
        <pre className="mt-2 whitespace-pre-wrap text-[11px] text-amber-600 dark:text-amber-400 font-mono">{result.error}</pre>
      )}
    </div>
  );
};

const formatTime = (secs) => {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const CodingInterview = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [problems, setProblems] = useState([]);
  const [problem, setProblem] = useState(null);
  const [loadingProblem, setLoadingProblem] = useState(true);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null); // 'run' | 'submit' | null
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const isAdmin = user && user.role === 'admin';

  // Session count-up timer.
  useEffect(() => {
    if (!isAdmin) return undefined;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [isAdmin]);

  const loadProblemDetail = useCallback(async (problemId, lang) => {
    setLoadingProblem(true);
    setError('');
    setLastResult(null);
    try {
      const res = await api.get(`/coding/problems/${problemId}`);
      const p = res.data.problem;
      setProblem(p);
      // Editor loads the boilerplate stub ONLY — never a solution (§1.2).
      setCode(p.starters?.[lang] ?? '');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load the coding problem.');
    } finally {
      setLoadingProblem(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const init = async () => {
      try {
        const res = await api.get('/coding/problems');
        const list = res.data.problems || [];
        setProblems(list);
        if (list.length) {
          await loadProblemDetail(list[0].id, language);
        } else {
          setLoadingProblem(false);
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load the problem set.');
        setLoadingProblem(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleProblemChange = (id) => {
    loadProblemDetail(id, language);
  };

  const handleLanguageChange = (lang) => {
    setLanguage(lang);
    if (problem) {
      setCode(problem.starters?.[lang] ?? `// workspace for ${lang}`);
    }
    setLastResult(null);
  };

  const handleReset = () => {
    if (problem) setCode(problem.starters?.[language] ?? '');
    setLastResult(null);
    setError('');
  };

  const execute = async (mode) => {
    if (!problem) return;
    setBusy(mode);
    setError('');
    setLastResult(null);
    try {
      const res = await api.post(`/coding/${mode}`, {
        problem_id: problem.id,
        language,
        code,
      });
      setLastResult(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong while executing your code. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  // --- Gating (§1.4): hidden from real candidates until verified & integrated ----
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto my-16 text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
          <Terminal size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Feature Under Development</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            The Coding Sandbox is currently undergoing validation and will be unlocked for candidates soon.
          </p>
        </div>
        <Button onClick={() => navigate(-1)} icon={ChevronLeft}>Go Back</Button>
      </div>
    );
  }

  const passed = lastResult?.passed ?? 0;
  const total = lastResult?.total ?? 0;
  const scorePct = lastResult?.score ?? 0;
  const allPassed = total > 0 && passed === total;

  return (
    <div className="space-y-5">
      {/* Header + back */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
        >
          <ChevronLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-2 text-sm font-mono text-slate-500 dark:text-slate-400">
          <Clock3 size={15} /> {formatTime(elapsed)}
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Problem panel */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <select
                className="glass-input py-1.5 px-3 text-sm cursor-pointer max-w-[70%]"
                value={problem?.id || ''}
                onChange={(e) => handleProblemChange(e.target.value)}
                disabled={loadingProblem || !!busy}
              >
                {problems.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
              {problem && (
                <Badge variant={DIFFICULTY_STYLES[problem.difficulty] || 'info'} size="lg">
                  {problem.difficulty}
                </Badge>
              )}
            </div>

            {loadingProblem ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
                <Spinner />
                <span className="text-sm">Loading problem…</span>
              </div>
            ) : problem ? (
              <>
                <div className="space-y-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Code2 size={18} className="text-primary-500" /> {problem.title}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {problem.prompt}
                  </p>
                </div>

                {problem.examples?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Examples</p>
                    {problem.examples.map((ex, i) => (
                      <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-3 font-mono text-xs space-y-1">
                        <div className="text-slate-700 dark:text-slate-200">Input: {ex.input}</div>
                        <div className="text-primary-600 dark:text-primary-300">Output: {ex.output}</div>
                        {ex.explanation && <div className="text-slate-500 dark:text-slate-400">{ex.explanation}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {problem.constraints?.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Constraints</p>
                    <ul className="space-y-1">
                      {problem.constraints.map((c, i) => (
                        <li key={i} className="text-xs font-mono text-slate-500 dark:text-slate-400">• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                  <ListChecks size={14} />
                  <span>{problem.sample_test_count} sample · {problem.total_test_count} total test cases</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 py-8 text-center">No problems available.</p>
            )}
          </Card>
        </div>

        {/* Editor + console */}
        <div className="lg:col-span-7 space-y-4">
          <Card padding={false} className="overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <select
                className="glass-input py-1 px-3 text-xs bg-white dark:bg-slate-900 cursor-pointer"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                disabled={!!busy}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" icon={RotateCcw} onClick={handleReset} disabled={!!busy}>
                  Reset
                </Button>
                <Button variant="secondary" size="sm" icon={Play} onClick={() => execute('run')} disabled={!!busy || !problem}>
                  {busy === 'run' ? 'Running…' : 'Run'}
                </Button>
                <Button size="sm" icon={Send} onClick={() => execute('submit')} disabled={!!busy || !problem}>
                  {busy === 'submit' ? 'Submitting…' : 'Submit'}
                </Button>
              </div>
            </div>

            <CodeEditor value={code} onChange={setCode} onRun={() => !busy && problem && execute('run')} disabled={!!busy} />

            {/* Console / results */}
            <div className="bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
              <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                  <Terminal size={14} /> Console
                </div>
                {lastResult && total > 0 && (
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <span className={allPassed ? 'text-emerald-500' : 'text-amber-500'}>
                      {passed}/{total} passed
                    </span>
                    <Badge variant={allPassed ? 'success' : scorePct > 0 ? 'warning' : 'error'} size="sm">
                      {scorePct}%
                    </Badge>
                  </div>
                )}
              </div>

              <div className="p-4 max-h-64 overflow-y-auto space-y-3">
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Loader2 size={14} className="animate-spin" />
                    {busy === 'run' ? 'Compiling and running sample tests…' : 'Evaluating against all test cases…'}
                  </div>
                )}

                {!busy && !lastResult && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Run your code against the sample tests, then Submit to evaluate against all hidden tests.
                  </p>
                )}

                {!busy && lastResult?.error && (
                  <Alert variant="warning">{lastResult.error}</Alert>
                )}

                {!busy && lastResult?.results?.length > 0 && (
                  <>
                    {lastResult.mode === 'submit' && (
                      <Alert variant={allPassed ? 'success' : 'warning'}>
                        {allPassed
                          ? 'All test cases passed. Submission recorded.'
                          : `${passed} of ${total} test cases passed. Submission recorded.`}
                      </Alert>
                    )}
                    <div className="space-y-2">
                      {lastResult.results.map((r) => (
                        <TestResultRow key={`${r.hidden ? 'h' : 's'}-${r.index}`} result={r} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CodingInterview;
