import { ScrollArea } from '@wellsfargo-starui/ui';

export function ConfigPreview({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ds-text-faint)]">
        {label}
      </span>
      <ScrollArea className="h-[160px] rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-sunken)]">
        <pre className="px-3 py-2 font-mono text-[11px] leading-relaxed text-[color:var(--ds-text-primary)]">
{JSON.stringify(value, null, 2)}
        </pre>
      </ScrollArea>
    </div>
  );
}
