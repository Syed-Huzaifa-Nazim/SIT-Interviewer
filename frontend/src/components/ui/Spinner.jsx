import React from 'react';

const sizes = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-4',
  lg: 'w-12 h-12 border-4',
};

const Spinner = ({ size = 'md', className = '', label }) => (
  <div className={`flex flex-col items-center gap-3 ${className}`}>
    <div
      className={`${sizes[size]} border-primary-500 border-t-transparent rounded-full animate-spin`}
      role="status"
      aria-label={label || 'Loading'}
    />
    {label && <p className="text-slate-400 text-xs font-medium">{label}</p>}
  </div>
);

export default Spinner;
