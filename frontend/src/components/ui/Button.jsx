import React from 'react';

const variants = {
  primary: 'bg-gradient-to-r from-primary-500 to-indigo-500 hover:from-primary-600 hover:to-indigo-600 text-white shadow-lg shadow-primary-600/25',
  secondary: 'bg-slate-900 dark:bg-slate-900/60 border border-slate-700 hover:border-slate-600 text-slate-200 hover:bg-slate-800',
  ghost: 'text-slate-400 hover:text-white hover:bg-slate-900/60',
  danger: 'bg-red-600/15 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white',
  success: 'bg-emerald-600/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-8 py-3.5 text-sm',
};

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  type = 'button',
  ...props
}) => {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 font-bold rounded-xl
        transition-all duration-200 cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : Icon && iconPosition === 'left' ? (
        <Icon size={size === 'sm' ? 14 : 16} />
      ) : null}
      {children}
      {!loading && Icon && iconPosition === 'right' ? (
        <Icon size={size === 'sm' ? 14 : 16} />
      ) : null}
    </button>
  );
};

export default Button;
