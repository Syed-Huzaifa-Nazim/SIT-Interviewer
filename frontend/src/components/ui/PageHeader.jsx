import React from 'react';

const PageHeader = ({ icon: Icon, title, subtitle, action, className = '' }) => (
  <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${className}`}>
    <div>
      <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5 tracking-tight">
        {Icon && <Icon className="text-primary-500 shrink-0" size={28} />}
        {title}
      </h1>
      {subtitle && (
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{subtitle}</p>
      )}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export default PageHeader;
