import React from 'react';

const variants = {
  primary: 'bg-gradient-to-r from-primary-600 to-accent-500 hover:from-primary-700 hover:to-accent-600 text-white shadow-lg shadow-primary-600/25 border-0',
  secondary: 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700',
  accent: 'bg-accent-500 hover:bg-accent-600 text-white shadow-sm hover:shadow-md transition-all',
  ghost: 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-slate-800',
  danger: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition-colors dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-400',
  success: 'bg-accent-50 text-accent-700 border border-accent-200 hover:bg-accent-500 hover:text-white transition-colors dark:bg-accent-900/20 dark:border-accent-800/30 dark:text-accent-400',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-8 py-3.5 text-base',
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
        inline-flex items-center justify-center gap-2 font-semibold rounded-lg
        transition-all duration-200 cursor-pointer tracking-wide
        active:scale-[0.97] disabled:active:scale-100
        disabled:opacity-60 disabled:cursor-not-allowed
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1
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
        <Icon size={size === 'sm' ? 14 : 18} />
      ) : null}
      {children}
      {!loading && Icon && iconPosition === 'right' ? (
        <Icon size={size === 'sm' ? 14 : 18} />
      ) : null}
    </button>
  );
};

export default Button;