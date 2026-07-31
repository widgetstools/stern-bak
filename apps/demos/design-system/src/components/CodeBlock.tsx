import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@wellsfargo-starui/ui';

export interface CodeBlockProps {
  code: string;
  label?: string;
}

/** Token-styled read-only code block with a copy button. */
export function CodeBlock({ code, label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--ds-border-primary)]">
      <div className="flex items-center justify-between bg-[color:var(--ds-surface-secondary)] px-2 py-1">
        <span className="text-[11px] font-medium text-[color:var(--ds-text-secondary)]">
          {label ?? 'Code'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[color:var(--ds-text-secondary)]"
          onClick={copy}
          aria-label="Copy code"
          data-testid="code-copy"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-[color:var(--ds-surface-ground)] p-3 text-[11px] leading-relaxed text-[color:var(--ds-text-primary)]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
