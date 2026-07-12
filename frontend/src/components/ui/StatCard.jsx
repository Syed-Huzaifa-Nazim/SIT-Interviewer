import React from 'react';
import Card from './Card';

const StatCard = ({ title, value, subtext, icon: Icon, trend, trendValue, color = 'primary' }) => {
  const colorMap = {
    primary: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-400',
    accent: 'text-accent-600 bg-accent-50 dark:bg-accent-900/30 dark:text-accent-400',
    violet: 'text-violet-600 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-400',
    success: 'text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400',
    warning: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400',
  };

  return (
    <Card hover className="flex items-start justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{value}</h3>

        {trend && (
          <div className="mt-2 flex items-center text-xs font-medium">
            <span className={trend === 'up' ? 'text-green-600' : 'text-red-600'}>
              {trend === 'up' ? '↑' : '↓'} {trendValue}
            </span>
            <span className="text-slate-400 ml-1">vs last month</span>
          </div>
        )}

        {subtext && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
        )}
      </div>
      <div className={`p-3 rounded-lg shrink-0 ${colorMap[color] || colorMap.primary}`}>
        {Icon && <Icon size={24} />}
      </div>
    </Card>
  );
};

export default StatCard;