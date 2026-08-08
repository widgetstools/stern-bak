/**
 * Right-rail stand-in for the CSRM LabScenarioRail — SSRM ticks come from
 * the STOMP broker, not the client demo console.
 */
export function SsrmInfoRail({ activeTab }: { activeTab: string }) {
  return (
    <aside
      className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-l border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-3"
      data-testid="ssrm-info-rail"
    >
      <div>
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
          SSRM lab
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">
          Active tab: <span className="text-[color:var(--ds-text-primary)]">{activeTab}</span>
        </p>
      </div>
      <p className="text-[12px] leading-relaxed text-[color:var(--ds-text-secondary)]">
        Rows stream through the SharedWorker <code className="text-[11px]">stomp-ssrm</code> plane
        (broker <code className="text-[11px]">ws://localhost:8081</code>). Feature tabs keep the same
        MarketsGrid chrome and profile seeding as the CSRM lab — only the row model is server-side.
      </p>
      <p className="text-[11px] leading-relaxed text-[color:var(--ds-text-secondary)]">
        The CSRM demo console (pause / tick / scenarios) is omitted here because the worker owns the
        data plane.
      </p>
    </aside>
  );
}
