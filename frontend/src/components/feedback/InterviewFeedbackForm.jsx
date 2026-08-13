import React, { useState } from 'react';
import { FEEDBACK_CATEGORIES } from '../../utils/constants';
import { Star } from 'lucide-react';

/**
 * The post-interview feedback form, shared by both places an interview can end.
 *
 * One-time candidates are signed out immediately and land on the thank-you screen; enrolled
 * candidates land on their report page. Both need to be asked the same questions, and when
 * this lived only on the thank-you screen the enrolled half of the intake was never asked at
 * all — their report page had a feedback tab, but it was one of six tabs, easy to miss, and
 * asked a single overall question with no categories.
 *
 * Submission is the caller's job (`onSubmit`), because the two callers authenticate
 * differently: the thank-you screen holds a token in a ref after clearing localStorage,
 * while the report page uses the shared api instance normally.
 */

const RATING_HINTS = ['', 'Very poor', 'Poor', 'Okay', 'Good', 'Excellent'];

const StarRating = ({ value, onChange, label, size = 22 }) => (
  <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
    {[1, 2, 3, 4, 5].map((n) => (
      <button
        key={n}
        type="button"
        role="radio"
        aria-checked={value === n}
        aria-label={`${n} out of 5 — ${RATING_HINTS[n]}`}
        // Clicking the current value clears it, so a rating given by accident can be undone
        // rather than being stuck at whatever was tapped first.
        onClick={() => onChange(value === n ? 0 : n)}
        className="rounded p-0.5 text-slate-300 transition-transform hover:scale-110 dark:text-slate-600"
      >
        <Star size={size} className={n <= value ? 'fill-amber-400 text-amber-400' : ''} />
      </button>
    ))}
  </div>
);

/** Mean of whatever categories were rated — the overall score when that row was skipped. */
const averageOf = (categories) => {
  const values = Object.values(categories);
  if (!values.length) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
};

const InterviewFeedbackForm = ({
  onSubmit,
  submitting = false,
  /** Rendered next to Submit; the thank-you screen uses it for "Skip & finish". */
  secondaryAction = null,
  compact = false,
}) => {
  const [overall, setOverall] = useState(0);
  const [categories, setCategories] = useState({});
  const [remarks, setRemarks] = useState('');
  const [issues, setIssues] = useState('');

  const setCategory = (key, value) =>
    setCategories((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });

  const hasAnything =
    overall > 0 || Object.keys(categories).length > 0 || remarks.trim() || issues.trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!hasAnything || submitting) return;
    onSubmit({
      // The backend requires an overall rating. Someone who rated only categories still
      // deserves to have that saved, so fall back to their average rather than rejecting it.
      rating: overall || averageOf(categories) || 5,
      feedback_text: remarks.trim() || null,
      issues_reported: issues.trim() || null,
      category_ratings: categories,
    });
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? 'space-y-4' : 'space-y-5'}>
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Overall
        </span>
        <StarRating value={overall} onChange={setOverall} label="Overall rating" size={28} />
        <span className="h-4 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {RATING_HINTS[overall] || ''}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:grid-cols-2">
        {FEEDBACK_CATEGORIES.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{c.label}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{c.hint}</div>
            </div>
            <StarRating
              value={categories[c.key] || 0}
              onChange={(v) => setCategory(c.key, v)}
              label={c.label}
              size={16}
            />
          </div>
        ))}
      </div>

      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div>
          <label
            htmlFor="fb-remarks"
            className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400"
          >
            Anything you&apos;d like to add
          </label>
          <textarea
            id="fb-remarks"
            rows={3}
            className="glass-input mt-1.5 w-full resize-none text-sm"
            placeholder="What went well, what could be better…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="fb-issues"
            className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400"
          >
            Any technical problems?
          </label>
          <input
            id="fb-issues"
            className="glass-input mt-1.5 w-full text-sm"
            placeholder="e.g. the microphone cut out on question 3"
            value={issues}
            onChange={(e) => setIssues(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {secondaryAction}
        <button
          type="submit"
          disabled={submitting || !hasAnything}
          className="rounded-lg bg-primary-600 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
        >
          {submitting ? 'Sending…' : 'Submit feedback'}
        </button>
      </div>
    </form>
  );
};

export default InterviewFeedbackForm;
