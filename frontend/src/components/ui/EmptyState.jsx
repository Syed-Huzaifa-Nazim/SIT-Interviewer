import React from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';

const EmptyState = ({ icon: Icon, message, actionLabel, actionTo, onAction }) => (
  <div className="text-center py-12 px-6 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl">
    {Icon && <Icon className="mx-auto text-slate-400 dark:text-slate-600 mb-3" size={32} />}
    <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">{message}</p>
    {actionLabel && actionTo && (
      <Link to={actionTo}>
        <Button size="sm">{actionLabel}</Button>
      </Link>
    )}
    {actionLabel && onAction && (
      <Button size="sm" onClick={onAction}>{actionLabel}</Button>
    )}
  </div>
);

export default EmptyState;
