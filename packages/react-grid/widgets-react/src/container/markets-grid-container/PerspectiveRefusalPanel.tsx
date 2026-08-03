/**
 * What a Perspective attach refusal looks like on screen.
 *
 * `attachPerspective` never rejects — every failure comes back as a `reason`,
 * because the caller's only useful response to any of them is to say so. Most
 * are permanent for the current config (a composite `keyColumn`, a provider
 * type that hosts no Table, a worker booted without the Perspective entry), so
 * leaving a spinner up would present "will never work" as "still loading" and
 * the user would wait out a wait that has no end.
 *
 * It renders over the pending surface rather than replacing it, so the grid
 * chrome and the provider picker stay reachable and the user can fix the
 * provider without reloading the window.
 */

import { AlertTriangle } from 'lucide-react';

export interface PerspectiveRefusalPanelProps {
  /** Name of the provider that was refused, when the catalog row resolved. */
  providerName?: string | null;
  /** The worker's own wording — not paraphrased here. */
  reason: string;
}

export function PerspectiveRefusalPanel({ providerName, reason }: PerspectiveRefusalPanelProps) {
  return (
    <div
      role="alert"
      data-testid="perspective-refusal"
      className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 p-6"
    >
      <div className="max-w-lg space-y-2 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <h2 className="text-sm font-semibold">
            {providerName
              ? `${providerName} has no Perspective Table`
              : 'No Perspective Table for this provider'}
          </h2>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{reason}</p>
      </div>
    </div>
  );
}
