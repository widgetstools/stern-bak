import { PALETTE_GROUPS } from '../palette';

export function PaletteSection() {
  return (
    <div className="flex flex-col gap-6" data-testid="ds-palette">
      <header className="flex flex-col gap-1">
        <h2 className="text-[18px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">Palette</h2>
        <p className="max-w-[70ch] text-[13px] text-[color:var(--ds-text-secondary)]">
          Semantic color tokens. Every swatch renders its live <code className="font-[var(--ds-font-mono)]">--ds-*</code> value,
          so they re-color when you flip the theme.
        </p>
      </header>
      {PALETTE_GROUPS.map((group) => (
        <section key={group.id} className="flex flex-col gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
            {group.label}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {group.swatches.map((s) => (
              <div
                key={s.varName}
                className="flex flex-col gap-1.5 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-2"
              >
                <div
                  className="h-12 w-full rounded border border-[color:var(--ds-border-primary)]"
                  style={{ background: `var(${s.varName})` }}
                  aria-hidden
                />
                <div className="flex flex-col">
                  <span className="text-[12px] font-medium text-[color:var(--ds-text-primary)]">{s.label}</span>
                  <span className="font-[var(--ds-font-mono)] text-[10px] text-[color:var(--ds-text-secondary)]">{s.varName}</span>
                  <span className="text-[10px] text-[color:var(--ds-text-muted)]">{s.role}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
