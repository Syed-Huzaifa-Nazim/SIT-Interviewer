import React from 'react';

/** Shared hero band for public marketing sub-pages. */
const PageHero = ({ eyebrow, title, subtitle }) => (
  <div className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
    <div className="max-w-4xl mx-auto px-6 py-16 text-center space-y-3">
      {eyebrow && (
        <span className="text-xs font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">{eyebrow}</span>
      )}
      <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">{title}</h1>
      {subtitle && <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">{subtitle}</p>}
    </div>
  </div>
);

export default PageHero;
