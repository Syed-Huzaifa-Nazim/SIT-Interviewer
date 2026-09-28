import React from 'react';
import { Languages, Check, Sparkles } from 'lucide-react';
import { LANGUAGE_OPTIONS } from '../../services/answerLanguage';

/**
 * Premium answer-language picker shown on the pre-interview device-check screen.
 *
 * Design notes (kept consistent with the existing interview theme):
 *  - Same visual language as the surrounding "glass-panel" cards: slate palette,
 *    primary/indigo accents, rounded-2xl, soft borders, dark-mode aware.
 *  - Card-style options with a check badge on the selected one, an accent gradient
 *    header and a subtle "used for every answer" reassurance line.
 *  - Purely presentational: state is owned by the parent via `value`/`onChange`.
 */
const AnswerLanguagePicker = ({ value, onChange, disabled = false }) => {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-primary-500/10 via-indigo-500/10 to-transparent border-b border-slate-200 dark:border-slate-800">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary-500 to-indigo-500 flex items-center justify-center shadow-md shadow-primary-500/25 shrink-0">
          <Languages className="text-white" size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            Answer Language
            <Sparkles size={12} className="text-primary-500" />
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            Choose the language you will answer in — AI transcription is tuned for it.
          </p>
        </div>
      </div>

      {/* Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
        {LANGUAGE_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`group relative text-left rounded-xl border p-4 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                selected
                  ? 'border-primary-500/60 bg-primary-500/[0.06] dark:bg-primary-500/10 shadow-md shadow-primary-500/10 ring-1 ring-primary-500/40'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:border-primary-500/40 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`text-lg font-extrabold leading-none ${
                    selected ? 'text-primary-600 dark:text-primary-400' : 'text-slate-800 dark:text-slate-200'
                  }`}
                  dir={opt.value === 'ur' ? 'rtl' : 'ltr'}
                >
                  {opt.label}
                </span>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    selected
                      ? 'bg-gradient-to-tr from-primary-500 to-indigo-500 text-white scale-100'
                      : 'border border-slate-300 dark:border-slate-700 scale-90 group-hover:scale-100'
                  }`}
                >
                  {selected && <Check size={12} strokeWidth={3} />}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {opt.desc}
              </p>
            </button>
          );
        })}
      </div>

      <p className="px-5 pb-4 text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
        You can switch the live-caption language anytime during the interview from the mic panel. Your audio is always transcribed with the language you pick here.
      </p>
    </div>
  );
};

export default AnswerLanguagePicker;
