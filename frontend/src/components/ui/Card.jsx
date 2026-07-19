import React from 'react';

const variants = {
  default: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm',
  // Keeps the lift-on-hover animation, but bug-safe:
  //  • `transform-gpu` forces a stable GPU compositing layer so the transform no longer
  //    leaves a shadow "ghost" (the grey box artifact) during the transition.
  //  • `shadow-lg` (≈12px horizontal reach) stays well inside the grid gap, so the hover
  //    shadow never spills onto the neighbouring card — that spill was the "adjacent card
  //    blinks" bug. (The old `shadow-corporate-hover` reached ~20px and bled across.)
  interactive: 'transform-gpu bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-primary-400 dark:hover:border-primary-600 cursor-pointer',
  highlighted: 'bg-primary-50/60 dark:bg-primary-950/20 border border-primary-200 dark:border-primary-800/60 shadow-corporate',
};

const Card = ({ children, className = '', hover = false, padding = true, variant = 'default' }) => {
  const variantClasses = hover ? variants.interactive : (variants[variant] || variants.default);

  return (
    <div
      className={`
        rounded-xl
        ${variantClasses}
        ${padding ? 'p-6' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = '' }) => {
  return (
    <div className={`border-b border-slate-200 dark:border-slate-800 pb-4 mb-4 ${className}`}>
      {children}
    </div>
  );
};

export const CardTitle = ({ children, className = '' }) => {
  return (
    <h3 className={`font-bold text-lg text-slate-900 dark:text-white ${className}`}>
      {children}
    </h3>
  );
};

export default Card;