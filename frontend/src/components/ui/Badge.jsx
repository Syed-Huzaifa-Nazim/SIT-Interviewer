import React from 'react';

const variants = {
  primary: 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400 border border-primary-200 dark:border-primary-800',
  accent: 'bg-accent-100 text-accent-800 dark:bg-accent-900/30 dark:text-accent-400 border border-accent-200 dark:border-accent-800',
  success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
  default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
};

const sizes = {
  sm: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

const Badge = ({ children, variant = 'neutral', size = 'sm', className = '' }) => {
  return (
    <span className={`inline-flex items-center rounded-full font-bold uppercase tracking-wider transition-colors duration-200 ${sizes[size] || sizes.sm} ${variants[variant] || variants.neutral} ${className}`}>
      {children}
    </span>
  );
};

export default Badge;