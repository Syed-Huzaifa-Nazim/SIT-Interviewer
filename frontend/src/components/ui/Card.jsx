import React from 'react';

const Card = ({
  children,
  className = '',
  variant = 'default',
  padding = true,
  ...props
}) => {
  const variants = {
    default: 'glass-panel',
    highlighted: 'glass-panel border-primary-500/30 shadow-lg shadow-primary-500/5',
    interactive: 'glass-panel glass-panel-hover cursor-pointer',
  };

  return (
    <div
      className={`rounded-2xl ${variants[variant] || variants.default} ${padding ? 'p-6' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = '' }) => (
  <div className={`border-b border-slate-200 dark:border-slate-800 pb-4 mb-4 ${className}`}>
    {children}
  </div>
);

export const CardTitle = ({ children, className = '' }) => (
  <h3 className={`font-bold text-lg text-slate-900 dark:text-white ${className}`}>
    {children}
  </h3>
);

export default Card;
