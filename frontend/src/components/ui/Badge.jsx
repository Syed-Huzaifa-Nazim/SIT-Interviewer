import React from 'react';

const variants = {
  default: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  primary: 'bg-primary-500/10 text-primary-400 border-primary-500/20',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

const Badge = ({ children, variant = 'default', className = '', size = 'sm' }) => {
  const sizeClasses = size === 'lg'
    ? 'px-3 py-1 text-xs'
    : 'px-2 py-0.5 text-[10px]';

  return (
    <span
      className={`
        inline-flex items-center gap-1 font-bold uppercase tracking-wider
        rounded-full border ${sizeClasses}
        ${variants[variant] || variants.default}
        ${className}
      `}
    >
      {children}
    </span>
  );
};

export default Badge;
