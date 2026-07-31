const RADII = [
  { varName: '--ds-radius-sm', label: 'sm' },
  { varName: '--ds-radius-md', label: 'md' },
  { varName: '--ds-radius-lg', label: 'lg' },
  { varName: '--ds-radius-xl', label: 'xl' },
  { varName: '--ds-radius-full', label: 'full' },
];

const ELEVATIONS = [
  { varName: '--ds-elevation-card', label: 'Card' },
  { varName: '--ds-elevation-overlay', label: 'Overlay' },
  { varName: '--ds-elevation-glow', label: 'Glow' },
];

export function FoundationsSection() {
  return (
    <div className="flex flex-col gap-6" data-testid="ds-foundations">
      <header className="flex flex-col gap-1">
        <h2 className="text-[18px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">Foundations</h2>
        <p className="max-w-[70ch] text-[13px] text-[color:var(--ds-text-secondary)]">
          Radius and elevation tokens, rendered live.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">Radius</h3>
        <div className="flex flex-wrap gap-4">
          {RADII.map((r) => (
            <div key={r.varName} className="flex flex-col items-center gap-1">
              <div
                className="h-16 w-16 border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)]"
                style={{ borderRadius: `var(${r.varName})` }}
                aria-hidden
              />
              <span className="font-[var(--ds-font-mono)] text-[10px] text-[color:var(--ds-text-secondary)]">{r.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">Elevation</h3>
        <div className="flex flex-wrap gap-6">
          {ELEVATIONS.map((e) => (
            <div key={e.varName} className="flex flex-col items-center gap-2">
              <div
                className="h-16 w-28 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
                style={{ boxShadow: `var(${e.varName})` }}
                aria-hidden
              />
              <span className="font-[var(--ds-font-mono)] text-[10px] text-[color:var(--ds-text-secondary)]">{e.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
