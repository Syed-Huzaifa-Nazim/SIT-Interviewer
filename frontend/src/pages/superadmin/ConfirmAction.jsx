import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/shadcn/button';
import { Input, Label } from '@/components/shadcn/input';

/**
 * Confirmation for the management portal's irreversible actions.
 *
 * NOT window.confirm(). That is the same conclusion DeleteButton reached for the Admin Hub,
 * for a reason worth repeating: a native confirm() blocks the tab's main thread until it is
 * dismissed, and the time spent reading and deciding is attributed to the click that opened
 * it — a real click measured as a 2+ second "slow" interaction in Chrome's Interaction
 * Timing panel, entirely from the dialog, with no actual lag anywhere.
 *
 * `confirmWord` adds a type-to-confirm step. Reserved for actions whose damage lands on
 * somebody who is not in the room: revoking an API key breaks a live integration on its
 * very next request, and the person clicking will not be the person it breaks for. A
 * one-click confirm is muscle memory; typing the name is not.
 */
const ConfirmAction = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmWord = null,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const [typed, setTyped] = useState('');

  if (!open) return null;

  const satisfied = !confirmWord || typed.trim() === confirmWord;

  const close = () => {
    setTyped('');
    onCancel();
  };

  const go = async () => {
    await onConfirm();
    setTyped('');
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm dark:bg-slate-950/80">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-foreground">
          <AlertTriangle className="shrink-0 text-destructive" size={19} />
          <span>{title}</span>
        </h3>

        <p className="text-xs leading-relaxed text-muted-foreground">{message}</p>

        {confirmWord && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-word">
              Type <code className="font-mono text-foreground">{confirmWord}</code> to confirm
            </Label>
            <Input
              id="confirm-word"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <Button variant="outline" size="sm" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={go}
            disabled={busy || !satisfied}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmAction;
