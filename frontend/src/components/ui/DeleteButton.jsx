import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

/**
 * Compact destructive-action button with a simple confirm dialog. Used for deleting
 * individual admin data rows (interviews, feedback, transactions, logs). User deletion
 * uses a stronger type-to-confirm modal instead (see AdminUsersPage).
 */
const DeleteButton = ({ onConfirm, confirmMessage = 'Delete this record permanently? This cannot be undone.', title = 'Delete', disabled = false }) => {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
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
  );
};

export default DeleteButton;
