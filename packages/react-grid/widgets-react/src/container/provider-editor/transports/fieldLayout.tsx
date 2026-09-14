/**
 * Shared field layout for the data-provider editors.
 *
 * `Card`, `Field` and `Help` existed twice — once in `StompFields`, once in
 * `RestFields` — which is why the two drifted apart. One copy, imported by
 * both, so a density change lands everywhere at once.
 *
 * The layout is deliberately LABEL-LEFT inside a two-column card. Stacking
 * label over control at full card width, with the card capped at `max-w-md`,
 * left the editor pane roughly half empty on a 900px surface: one narrow
 * column of fields and a large stranded area to its right. A label column plus
 * two field columns fills the pane and roughly halves the vertical run, with
 * no change to the controls themselves.
 *
 * Both fall back to a single column under `lg`, where a second column would
 * leave the inputs too narrow to read a URL or a JSON body in.
 */
import type { ReactNode } from 'react';
import { Label } from '@wellsfargo-starui/react';

export interface CardProps {
  title: string;
  children: ReactNode;
  /**
   * Force a single column. For cards whose fields are all wide by nature
   * (a JSON body, a key/value table) where a second column only narrows them.
   */
  single?: boolean;
}

export function Card({ title, children, single }: CardProps) {
  return (
    <section className="rounded-md border border-border bg-muted/30">
      <h3 className="px-3.5 py-2 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      <div className={single ? 'p-3.5 space-y-3' : 'p-3.5 grid grid-cols-1 lg:grid-cols-2 gap-x-7 gap-y-3'}>
        {children}
      </div>
    </section>
  );
}

export interface FieldProps {
  label: string;
  required?: boolean;
  children: ReactNode;
  /** Take the full card width — for controls that need the room (JSON, tables, long help). */
  wide?: boolean;
  className?: string;
}

export function Field({ label, required, children, wide, className }: FieldProps) {
  return (
    <div
      className={[
        // `items-start` + the label's `pt-2` keeps the label on the first line
        // of a control that grew (a textarea, a field carrying Help beneath).
        'grid grid-cols-[132px_minmax(0,1fr)] items-start gap-3',
        wide ? 'lg:col-span-2' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      <Label className="pt-2 text-xs font-medium text-muted-foreground">
        {label}{required ? ' *' : ''}
      </Label>
      <div className="min-w-0 space-y-1.5">{children}</div>
    </div>
  );
}

export function Help({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}
