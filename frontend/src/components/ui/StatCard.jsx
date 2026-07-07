import React from 'react';

const StatCard = ({ label, value, subtext, icon: Icon, iconColor = 'text-primary-400', iconBg = 'bg-primary-500/10 border-primary-500/20' }) => (
  <div className="glass-panel p-6 rounded-2xl flex items-center justify-between relative overflow-hidden group hover:border-primary-500/20 transition-all duration-300">
    <div className="space-y-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">{label}</span>
      <span className="text-3xl font-black text-slate-900 dark:text-white">{value}</span>
      {subtext && <span className="text-[10px] text-slate-500 block pt-1">{subtext}</span>}
    </div>
    {Icon && (
      <div className={`p-3.5 border rounded-xl ${iconBg} ${iconColor} group-hover:scale-110 transition-transform duration-300`}>
        <Icon size={22} />
      </div>
    )}
  </div>
);

export default StatCard;
