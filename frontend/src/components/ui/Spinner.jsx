import React from 'react';

const sizes = {
  sm: {
    outer: 'w-6 h-6 border-2',
    inner: 'w-3 h-3 border-2',
  },
  md: {
    outer: 'w-10 h-10 border-[3px]',
    inner: 'w-6 h-6 border-[3px]',
  },
  lg: {
    outer: 'w-16 h-16 border-4',
    inner: 'w-10 h-10 border-4',
  },
};

const Spinner = ({ size = 'md', className = '', label }) => {
  const currentSize = sizes[size] || sizes.md;

  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <div className="relative flex items-center justify-center" role="status" aria-label={label || 'Loading'}>
        {/* Outer Ring: Rotating Blue */}
        <div className={`${currentSize.outer} border-primary-600 border-t-transparent border-b-transparent rounded-full animate-spin`} />
        
        {/* Inner Ring: Reverse Rotating Green */}
        <div className={`absolute ${currentSize.inner} border-accent-500 border-l-transparent border-r-transparent rounded-full animate-spin [animation-direction:reverse]`} />
        
        {/* Glowing Center */}
        <div className="absolute w-1.5 h-1.5 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 blur-[1px] animate-pulse" />
      </div>
      {label && (
        <p className="text-slate-500 dark:text-slate-400 text-xs font-bold font-sans tracking-wide uppercase animate-pulse">
          {label}
        </p>
      )}
    </div>
  );
};

export default Spinner;
