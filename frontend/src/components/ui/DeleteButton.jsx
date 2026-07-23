import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, AlertTriangle } from 'lucide-react';
import Button from './Button';

/**
 * Compact destructive-action button with a themed confirm modal. Used for deleting
 * individual admin data rows (interviews, feedback, transactions, logs). User deletion
 * uses a stronger type-to-confirm modal instead (see AdminUsersPage).
 *
 * Deliberately NOT window.confirm(): a native confirm() dialog blocks the entire tab's
 * main thread until dismissed, and the time spent reading/deciding gets attributed to the
 * click interaction itself — on a real click this showed up as a 2+ second "slow" click in
 * Chrome's Interaction Timing panel, purely from the blocking dialog, not any real lag.
 */
const DeleteButton = ({ onConfirm, confirmMessage = 'Delete this record permanently? This cannot be undone.', title = 'Delete', disabled = false }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled || busy}
        title={title}
        className="p-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
      >
        {busy ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <Trash2 size={14} />
        )}
      </button>

      {confirming && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 p-6 rounded-2xl border border-red-500/40 space-y-5 shadow-2xl">
            <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="text-red-500 shrink-0" size={19} />
              <span>{title}</span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {confirmMessage}
            </p>
            <div className="flex items-center justify-end gap-3 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" icon={Trash2} onClick={handleConfirm} loading={busy}>
                Delete
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default DeleteButton;
