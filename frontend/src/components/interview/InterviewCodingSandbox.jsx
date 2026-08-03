import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../services/api';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import { Play, Send, Terminal, Database, CheckCircle2, XCircle, Clock3, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * The hands-on coding exercise a Completed-course interview opens with.
 *
 * Deliberately self-contained: it fetches its own problem, runs and grades through the
 * candidate-scoped endpoints, and hands the finished answer back to InterviewSession via
 * `onSubmitAnswer`. Keeping it out of InterviewSession means the proctoring, timer and
 * transcript logic in that file is untouched by this feature.
 */

const statusMeta = {
  passed: { icon: CheckCircle2, variant: 'success', label: 'Passed', color: 'text-emerald-500' },
  failed: { icon: XCircle, variant: 'error', label: 'Failed', color: 'text-red-500' },
  timeout: { icon: Clock3, variant: 'warning', label: 'Timed out', color: 'text-amber-500' },
  error: { icon: AlertTriangle, variant: 'warning', label: 'Error', color: 'text-amber-500' },
};

const ResultTable = ({ columns, rows }) => {
  if (!rows || rows.length === 0) {
    return <div className="text-[11px] italic text-slate-400 py-1">No rows returned</div>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-[11px] font-mono">
        <thead>
          <tr className="bg-slate-800/70">
            {(columns || []).map((c, i) => (
              <th key={i} className="px-2.5 py-1.5 text-left font-bold text-slate-300 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-2.5 py-1.5 text-slate-200 whitespace-nowrap">
                  {cell === null ? <span className="text-slate-500 italic">NULL</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const InterviewCodingSandbox = ({ problemId, interviewId, onSubmitAnswer, disabled }) => {
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/coding/interview-problem/${problemId}`);
        if (cancelled) return;
        const p = res.data.problem;
        setProblem(p);
        const lang = p.language === 'sql' ? 'sql' : 'python';
        setLanguage(lang);
        setCode(p.starters?.[lang] ?? '');
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.detail || 'Could not load the coding question.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [problemId]);

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart, selectionEnd } = e.target;
      const next = code.substring(0, selectionStart) + '    ' + code.substring(selectionEnd);
      setCode(next);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = selectionStart + 4;
        }
      });
    }
  };

  const runTests = useCallback(async () => {
    setBusy('run');
    setError('');
    setResult(null);
    try {
      const res = await api.post('/coding/interview-run', { problem_id: problemId, language, code });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not run your code. Please try again.');
    } finally {
      setBusy(null);
    }
  }, [problemId, language, code]);

  const submitSolution = useCallback(async () => {
    setBusy('submit');
    setError('');
    try {
      const res = await api.post('/coding/interview-submit', {
        problem_id: problemId,
        language,
        code,
        interview_id: interviewId,
      });
      setResult(res.data);
      // Hand the graded work back as this question's answer. The score is included so the
      // report reflects how the exercise actually performed against the hidden tests.
      const summary =
        `[Coding exercise: ${problem?.title || problemId} — ${language}]\n` +
        `Result: ${res.data.passed}/${res.data.total} test cases passed (${res.data.score}%).\n\n` +
        `${code}`;
      onSubmitAnswer(summary);
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not submit your solution. Please try again.');
      setBusy(null);
    }
  }, [problemId, language, code, interviewId, problem, onSubmitAnswer]);

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center gap-3 text-slate-500">
        <Spinner />
        <span className="text-sm">Loading your coding exercise…</span>
      </div>
    );
  }

  if (!problem) {
    return <Alert variant="error">{error || 'Coding question unavailable.'}</Alert>;
  }

  const lineCount = code.split('\n').length;
  const isSql = problem.language === 'sql';

  const hasDetails =
    (isSql && (problem.schema_display?.length > 0 || problem.sample_datasets?.length > 0)) ||
    problem.examples?.length > 0 ||
    problem.constraints?.length > 0;

  return (
    <div className="w-full space-y-4 text-left">
      {/* Card 1 — the question itself. Kept short: badges + the scenario, nothing else,
          so it never forces a scroll on its own. */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="primary" size="sm">Coding Exercise</Badge>
            <Badge variant={problem.difficulty === 'Easy' ? 'success' : problem.difficulty === 'Hard' ? 'error' : 'warning'} size="sm">
              {problem.difficulty}
            </Badge>
            {isSql && <Badge variant="info" size="sm">SQL</Badge>}
          </div>
          <span className="text-[11px] text-slate-500">
            {problem.sample_test_count} sample · {problem.total_test_count} total tests
          </span>
        </div>

        {/* The scenario, not the problem title, is the actual question — so it is rendered as
            a highlighted block immediately under the heading, on its own. */}
        <div className="rounded-xl border-l-4 border-primary-500 bg-primary-50/60 dark:bg-primary-500/5 border-y border-r border-slate-200 dark:border-slate-800 p-4 md:p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400 mb-2">
            The Scenario
          </p>
          <p className="text-sm md:text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
            {problem.prompt}
          </p>
        </div>
      </div>

      {/* Card 2 — supporting reference material (schema, sample data, examples, constraints).
          Split out from the question card so a long prompt doesn't drag all of this down
          with it into one endless scroll. Capped at a fixed height with its own scrollbar so
          a problem with lots of examples/constraints stays contained instead of pushing the
          editor further down the page. */}
      {hasDetails && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 md:p-5">
        <div className="max-h-64 overflow-y-auto space-y-4 pr-1">
          {isSql && problem.schema_display?.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Database Schema</p>
              {problem.schema_display.map((t) => (
                <div key={t.table} className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900/70 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Database size={12} className="text-primary-500" /> {t.table}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {t.columns.map((c) => (
                      <div key={c.name} className="px-3 py-1 flex justify-between font-mono text-[10px]">
                        <span className="text-slate-700 dark:text-slate-200">{c.name}</span>
                        <span className="text-slate-400">{c.type}{c.note ? ` · ${c.note}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isSql && problem.sample_datasets?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Sample Data</p>
              {problem.sample_datasets.map((d, i) => (
                <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-2.5 space-y-1">
                  <p className="text-[10px] font-semibold text-slate-500">{d.name}</p>
                  <pre className="whitespace-pre-wrap font-mono text-[10px] text-slate-600 dark:text-slate-300">{d.seed}</pre>
                </div>
              ))}
            </div>
          )}

          {/* Worked examples — the candidate cannot infer the expected output shape without
              them, and they were reaching the admin sandbox but not this one. */}
          {problem.examples?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Examples</p>
              {problem.examples.map((ex, i) => (
                <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-2.5 font-mono text-[11px] space-y-0.5">
                  <div className="text-slate-700 dark:text-slate-200">Input: {ex.input}</div>
                  <div className="text-primary-600 dark:text-primary-300">Output: {ex.output}</div>
                  {ex.explanation && <div className="text-slate-500">{ex.explanation}</div>}
                </div>
              ))}
            </div>
          )}

          {problem.constraints?.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Constraints</p>
              <ul className="space-y-0.5">
                {problem.constraints.map((c, i) => (
                  <li key={i} className="text-[11px] font-mono text-slate-500">• {c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        </div>
      )}

      {error && <Alert variant="error" className="text-xs">{error}</Alert>}

      {/* Card 3 — code editor + console. */}
      <div className="rounded-xl overflow-hidden border border-slate-700">
        <div className="px-3 py-2 bg-slate-800 flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-300">{isSql ? 'SQL (SQLite)' : 'Python 3'}</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={Play} onClick={runTests} disabled={!!busy || disabled}>
              {busy === 'run' ? 'Running…' : 'Run'}
            </Button>
            <Button size="sm" icon={Send} onClick={submitSolution} disabled={!!busy || disabled}>
              {busy === 'submit' ? 'Submitting…' : 'Submit Answer'}
            </Button>
          </div>
        </div>
        <div className="flex bg-slate-950 min-h-[220px]">
          <div ref={gutterRef} className="select-none overflow-hidden py-3 px-2.5 text-right font-mono text-[11px] leading-relaxed text-slate-600 bg-slate-900/60 border-r border-slate-800" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <textarea
            ref={textareaRef}
            className="flex-1 w-full bg-slate-950 p-3 font-mono text-[13px] text-slate-100 border-none outline-none focus:ring-0 resize-none leading-relaxed min-h-[220px]"
            style={{ tabSize: 4 }}
            spellCheck={false}
            value={code}
            disabled={!!busy || disabled}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
          />
        </div>

        {/* Console */}
        <div className="bg-slate-900 border-t border-slate-800">
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-800">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
              <Terminal size={12} /> Console
            </span>
            {result?.total > 0 && (
              <span className={`text-[11px] font-bold ${result.passed === result.total ? 'text-emerald-400' : 'text-amber-400'}`}>
                {result.passed}/{result.total} passed
              </span>
            )}
          </div>
          <div className="p-3 max-h-52 overflow-y-auto space-y-2">
            {busy && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <Loader2 size={12} className="animate-spin" />
                {busy === 'run' ? 'Running sample tests…' : 'Evaluating your solution…'}
              </div>
            )}
            {!busy && !result && (
              <p className="text-[11px] text-slate-500 font-mono">
                Run your code against the sample tests, then Submit Answer to finish this question.
              </p>
            )}
            {!busy && result?.error && <Alert variant="warning" className="text-xs">{result.error}</Alert>}
            {!busy && result?.results?.map((r) => {
              const meta = statusMeta[r.status] || statusMeta.error;
              const Icon = meta.icon;
              return (
                <div key={`${r.hidden ? 'h' : 's'}-${r.index}`} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                      <Icon size={13} className={meta.color} />
                      {r.hidden ? `Hidden test #${r.index}` : `Sample test #${r.index}`}
                      {r.scenario && <span className="font-normal text-slate-500">— {r.scenario}</span>}
                    </span>
                    <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                  </div>
                  {!r.hidden && r.rows !== undefined && (
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <p className="text-[9px] uppercase tracking-wide text-slate-500 mb-1">Your result</p>
                        <ResultTable columns={r.columns} rows={r.rows} />
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wide text-slate-500 mb-1">Expected</p>
                        <ResultTable columns={r.expected_columns?.length ? r.expected_columns : r.columns} rows={r.expected_rows} />
                      </div>
                    </div>
                  )}
                  {!r.hidden && r.rows === undefined && r.input !== undefined && (
                    <div className="mt-1.5 font-mono text-[10px] text-slate-400 space-y-0.5">
                      <div>Input: {r.input}</div>
                      <div>Expected: {JSON.stringify(r.expected)}</div>
                      {r.status === 'failed' && <div className="text-red-400">Got: {JSON.stringify(r.actual)}</div>}
                    </div>
                  )}
                  {r.error && <pre className="mt-1.5 whitespace-pre-wrap text-[10px] text-amber-400 font-mono">{r.error}</pre>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewCodingSandbox;
