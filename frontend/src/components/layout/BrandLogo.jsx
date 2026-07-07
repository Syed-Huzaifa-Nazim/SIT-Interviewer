import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

const BrandLogo = ({ to = '/', size = 'md', variant = 'default', className = '' }) => {
  const sizes = {
    sm: { img: 'w-7 h-7', text: 'text-lg' },
    md: { img: 'w-8 h-8', text: 'text-xl' },
    lg: { img: 'w-10 h-10', text: 'text-2xl' },
  };

  const s = sizes[size] || sizes.md;

  if (variant === 'admin') {
    return (
      <Link to={to} className={`flex items-center gap-2 font-extrabold text-white tracking-tight ${className}`}>
        <div className="p-1.5 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-lg">
          <Sparkles size={16} className="text-white" />
        </div>
        <span className="text-lg">Admin Workspace</span>
      </Link>
    );
  }

  return (
    <Link to={to} className={`flex items-center gap-2.5 font-bold tracking-tight text-slate-900 dark:text-white ${s.text} ${className}`}>
      <img src="/logo.jpg" alt="Interviewer.AI" className={`${s.img} rounded-xl object-cover ring-2 ring-primary-500/20`} />
      <span>
        Interviewer<span className="text-primary-500">.AI</span>
      </span>
    </Link>
  );
};

export default BrandLogo;
