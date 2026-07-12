import React from 'react';

const variants = {
  default: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm',
  interactive: 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300 hover:shadow-corporate-hover hover:-translate-y-1 hover:border-primary-300 dark:hover:border-primary-700 cursor-pointer',
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