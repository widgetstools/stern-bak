/**
 * A feed's fields, rendered as something you can actually read.
 *
 * A positions row has 256 fields. Listed flat that is a wall of names nobody
 * scans, which is why the assistant could describe a feed but never really
 * offer it. Here they arrive grouped the way a desk thinks about them —
 * Identity, Pricing, Risk, Credit, P&L — with the curated blotter set marked
 * and the provider's current selection shown against it.
 *
 * This is a presentation surface, not a form: selection still happens by asking
 * ("add OAS and drop SEDOL"), which the model turns into `set_provider_columns`.
 * Making it clickable would mean routing UI state back through the chat loop for
 * no gain over saying it.
 */
import { useState } from 'react';
import { Check, ChevronRight, Star } from 'lucide-react';
import { cn } from '@wellsfargo-starui/react';
import type { FieldCellPayload } from '../providerFieldTools';

const TYPE_GLYPH: Record<string, string> = {
  number: '#',
  text: 'A',
  boolean: '✓',
  date: '📅',
  dateString: '📅',
  object: '{}',
};

export function FieldPickerCell({ payload }: { payload: FieldCellPayload }) {
  // Groups holding a selected field open by default — that is where the
  // conversation is, and it saves a click on the ones that matter.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      payload.groups.map((g) => [g.group, g.fields.some((f) => payload.selected.includes(f.field))]),
    ),
  );

  const selected = new Set(payload.selected);
  const curatedCount = payload.groups.reduce((n, g) => n + g.fields.filter((f) => f.curated).length, 0);
  const total = payload.groups.reduce((n, g) => n + g.fields.length, 0);

  return (
    <div className="w-full rounded-lg border border-border/60 overflow-hidden">
      <div className="flex items-baseline gap-2 px-2.5 py-1.5 border-b border-border/60 bg-muted/20">
        <span className="font-mono text-[11px] text-foreground/90">{payload.title}</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{payload.subtitle}</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {selected.size}/{total}
        </span>
      </div>

      <div className="flex items-center gap-3 px-2.5 py-1 border-b border-border/60 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Check className="h-3 w-3" /> on the blotter
        </span>
        <span className="inline-flex items-center gap-1">
          <Star className="h-3 w-3" /> curated ({curatedCount})
        </span>
      </div>

      <div className="max-h-72 overflow-auto bn-scrollbar">
        {payload.groups.map((group) => {
          const chosen = group.fields.filter((f) => selected.has(f.field)).length;
          const isOpen = open[group.group];
          return (
            <div key={group.group} className="border-b border-border/30 last:border-0">
              <button
                type="button"
                onClick={() => setOpen((prev) => ({ ...prev, [group.group]: !prev[group.group] }))}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-muted/30 transition-colors"
              >
                <ChevronRight
                  className={cn('h-3 w-3 flex-shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')}
                />
                <span className="text-[11px] font-medium text-foreground/90">{group.group}</span>
                <span className="text-[10px] text-muted-foreground">{group.fields.length}</span>
                {chosen > 0 && (
                  <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                    {chosen} on
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 px-2.5 pb-1.5">
                  {group.fields.map((field) => {
                    const on = selected.has(field.field);
                    return (
                      <div
                        key={field.field}
                        className={cn(
                          'flex items-center gap-1.5 py-0.5 text-[10px] min-w-0',
                          on ? 'text-foreground' : 'text-muted-foreground',
                        )}
                        title={`${field.headerName} · ${field.field} · ${field.cellDataType}`}
                      >
                        <span className="w-3 flex-shrink-0 text-center">
                          {on ? <Check className="h-2.5 w-2.5 inline" /> : ''}
                        </span>
                        <span className="w-3 flex-shrink-0 text-center font-mono text-muted-foreground/70">
                          {TYPE_GLYPH[field.cellDataType] ?? '?'}
                        </span>
                        <span className="truncate font-mono">{field.field}</span>
                        {field.curated && <Star className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/60" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-2.5 py-1 text-[10px] text-muted-foreground border-t border-border/60">
        Ask to change the set — “add OAS and Z-spread”, “just the curated columns”, “drop the identifiers”.
      </div>
    </div>
  );
}
