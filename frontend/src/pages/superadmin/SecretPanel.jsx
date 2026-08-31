import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

import { Button } from '@/components/shadcn/button';

/**
 * One-shot secret display: a new admin's password, recovery codes, a fresh API key.
 *
 * Everything shown here is returned by the server exactly once and stored only as a hash,
 * so this panel is the only chance anybody has to keep it. It therefore stays until it is
 * dismissed deliberately — auto-hiding a value that cannot be retrieved again is how an
 * admin ends up locked out or an integration ends up with no credential.
 */
const SecretPanel = ({ title, description, values, onDone }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(values.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in some browsers and over plain http. The values are
      // on screen either way, which is what actually matters.
      setCopied(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {values.map((v) => (
          <code
            key={v}
            className="overflow-x-auto rounded-md border border-border bg-card px-3 py-2 font-mono text-sm tracking-wider text-foreground"
          >
            {v}
          </code>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy all'}
        </Button>
        <Button size="sm" onClick={onDone}>
          I have saved these
        </Button>
      </div>
    </div>
  );
};

export default SecretPanel;
