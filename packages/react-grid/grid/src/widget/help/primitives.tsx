/**
 * Shared presentational primitives used across HelpPanel sections.
 * Pure presentational — no state, no side effects. Tokens come from
 * the design system (shadcn semantic tokens → dark/light safe).
 */

import type { ReactNode } from 'react';
import { cn } from '@wellsfargo-starui/react';

export function H1({ children }: { children: ReactNode }) {
  return (
    <h1 className="mb-2 text-[19px] font-bold tracking-[0.2px] text-foreground">
      {children}
    </h1>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-7 mb-2.5 border-b border-border pb-1.5 text-[13.5px] font-semibold tracking-[0.1px] text-foreground">
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-5 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.55px] text-muted-foreground">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="ds-help-p">{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[4px] border border-border bg-muted px-1.5 py-px font-mono text-[11px] text-foreground">
      {children}
    </code>
  );
}

export function Pre({ children }: { children: ReactNode }) {
  return (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-muted/50 px-3.5 py-3 font-mono text-[11px] leading-[1.6] text-foreground">
      {children}
    </pre>
  );
}

export function Table({ rows, cols }: { cols: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-muted/60">
            {cols.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-muted-foreground"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/70 transition-colors hover:bg-muted/30">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    'px-3 py-[7px] align-top text-foreground',
                    j === 0 && 'font-medium',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
