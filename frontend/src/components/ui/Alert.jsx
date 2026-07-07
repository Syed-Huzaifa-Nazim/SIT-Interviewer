import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

const config = {
  error: {
    icon: AlertCircle,
    classes: 'bg-red-500/10 border-red-500/30 text-red-400',
  },
  success: {
    icon: CheckCircle,
    classes: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  },
  warning: {
    icon: AlertTriangle,
    classes: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  },
  info: {
    icon: Info,
    classes: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  },
};

const Alert = ({ variant = 'error', children, className = '' }) => {
  const { icon: Icon, classes } = config[variant] || config.error;

  return (
    <div className={`p-4 border rounded-xl text-sm flex items-start gap-2.5 ${classes} ${className}`}>
      <Icon size={16} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
};

export default Alert;
