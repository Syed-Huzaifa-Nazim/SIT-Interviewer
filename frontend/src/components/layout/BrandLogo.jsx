import React from 'react';

const BrandLogo = ({ variant = 'default', size = 'md', className = '' }) => {
  const imgSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <div className={`flex items-center gap-2.5 font-bold tracking-tight select-none ${className}`}>
      {/* Saylani Circular Logo Container */}
      <div className={`${imgSizes[size] || imgSizes.md} rounded-xl overflow-hidden border border-slate-700/20 dark:border-slate-800/40 shadow-md bg-white shrink-0`}>
        <img 
          src="/logo.jpg" 
          alt="Saylani Logo" 
          className="w-full h-full object-cover"
        />
      </div>
      
      {/* Brand Text */}
      <div className={`${textSizes[size] || textSizes.md} flex items-center gap-1.5 font-sans leading-none`}>
        <span className="text-accent-500 font-black">
          SIT
        </span>
        <span className="text-slate-900 dark:text-white font-extrabold">
          Interviewer
        </span>
        <span className="text-primary-600 dark:text-primary-400 font-black">
          {variant === 'admin' ? 'Admin' : ''}
        </span>
      </div>
    </div>
  );
};

export default BrandLogo;