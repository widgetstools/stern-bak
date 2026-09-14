/**
 * Landing page: the feature-by-feature SSRM parity matrix — what this app
 * exists to answer. Every lab tab, its verdict, and the mechanisms behind
 * each gap; click a row to open the live tab and see it.
 */
import { PARITY, type ParityStatus } from './parityNotes';
import { STATUS_CLASS, STATUS_LABEL } from './SsrmParityBadge';

const ORDER: ParityStatus[] = ['gap', 'partial', 'full'];

export function ParityMatrixTab({ onNavigate }: { onNavigate: (tabId: string) => void }) {
  const counts = PARITY.reduce(
    (acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }),
    {} as Record<ParityStatus, number>,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
      <div className="mx-auto w-full max-w-4xl">
        <h2 className="text-[20px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
          SSRM parity, feature by feature
        </h2>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[color:var(--ds-text-secondary)]">
          Every tab runs the CSRM lab&apos;s own <code>LabFeatureConfig</code> — same columns, same
          profiles, same scenarios — against the server-side row model, fed by the same worker
          mock generator through the SSRM WASM engine (<code>mock-ssrm</code>). Differences you
          see are therefore attributable to the row model alone. Verdicts below; each live tab
          repeats its own with the mechanisms.
        </p>

        <div className="mt-4 flex gap-2">
          {ORDER.map((status) => (
            <span
              key={status}
              className={`rounded-sm border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_CLASS[status]}`}
            >
              {STATUS_LABEL[status]} · {counts[status] ?? 0}
            </span>
          ))}
        </div>

        <table className="mt-5 w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[color:var(--ds-border-primary)] text-left text-[11px] uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
              <th className="px-2 py-2">Feature</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Under SSRM</th>
            </tr>
          </thead>
          <tbody>
            {PARITY.map((entry) => (
              <tr
                key={entry.tabId}
                className="cursor-pointer border-b border-[color:var(--ds-border-primary)] align-top hover:bg-[color:var(--ds-surface-secondary)]"
                onClick={() => onNavigate(entry.tabId)}
                data-testid={`parity-row-${entry.tabId}`}
              >
                <td className="whitespace-nowrap px-2 py-2 font-medium text-[color:var(--ds-text-primary)]">
                  {entry.label}
                </td>
                <td className="whitespace-nowrap px-2 py-2">
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLASS[entry.status]}`}
                  >
                    {STATUS_LABEL[entry.status]}
                  </span>
                </td>
                <td className="px-2 py-2 text-[color:var(--ds-text-secondary)]">{entry.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-5 text-[12px] leading-relaxed text-[color:var(--ds-text-faint)]">
          The former write-path gaps (bulk update, plus/minus, shortcuts, undo) closed with the
          engine edit writer on the <code>applyPatches</code> seam (plan §12 C1/C2). Remaining
          partials await engine capabilities — expressions (T3/T4), book-wide alert predicates
          (T5) — tracked in the Rust engine plan under <code>docs/superpowers/plans/</code>.
        </p>
      </div>
    </div>
  );
}
