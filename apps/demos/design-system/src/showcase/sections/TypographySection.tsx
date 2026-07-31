interface TypeRow {
  varName: string;
  label: string;
  sample: string;
}

const SIZES: TypeRow[] = [
  { varName: '--ds-font-size-3xl', label: '3xl', sample: 'Display heading' },
  { varName: '--ds-font-size-2xl', label: '2xl', sample: 'Section heading' },
  { varName: '--ds-font-size-xl', label: 'xl', sample: 'Subsection heading' },
  { varName: '--ds-font-size-lg', label: 'lg', sample: '102.375 KPI value' },
  { varName: '--ds-font-size-md', label: 'md', sample: 'Section title / CTA' },
  { varName: '--ds-font-size-body', label: 'body', sample: 'Body text — default' },
  { varName: '--ds-font-size-sm', label: 'sm', sample: 'Table cell / data' },
  { varName: '--ds-font-size-xs', label: 'xs', sample: 'Caption / column header' },
  { varName: '--ds-font-size-2xs', label: '2xs', sample: 'Micro label' },
];

export function TypographySection() {
  return (
    <div className="flex flex-col gap-6" data-testid="ds-typography">
      <header className="flex flex-col gap-1">
        <h2 className="text-[18px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">Typography</h2>
        <p className="max-w-[70ch] text-[13px] text-[color:var(--ds-text-secondary)]">
          The type scale and font families, driven by <code className="font-[var(--ds-font-mono)]">--ds-font-*</code> tokens.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">Families</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-3">
            <div className="text-[11px] text-[color:var(--ds-text-secondary)]">Sans · --ds-font-sans</div>
            <div className="text-[18px] text-[color:var(--ds-text-primary)]" style={{ fontFamily: 'var(--ds-font-sans)' }}>
              The quick brown fox · 0123456789
            </div>
          </div>
          <div className="rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-3">
            <div className="text-[11px] text-[color:var(--ds-text-secondary)]">Mono · --ds-font-mono</div>
            <div className="text-[18px] text-[color:var(--ds-text-primary)]" style={{ fontFamily: 'var(--ds-font-mono)' }}>
              102.375 +0.42% · 912828Z78
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">Scale</h3>
        <div className="flex flex-col divide-y divide-[color:var(--ds-border-primary)] rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]">
          {SIZES.map((row) => (
            <div key={row.varName} className="flex items-baseline gap-4 px-3 py-2">
              <span className="w-12 shrink-0 font-[var(--ds-font-mono)] text-[11px] text-[color:var(--ds-text-secondary)]">{row.label}</span>
              <span className="text-[color:var(--ds-text-primary)]" style={{ fontSize: `var(${row.varName})` }}>{row.sample}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
