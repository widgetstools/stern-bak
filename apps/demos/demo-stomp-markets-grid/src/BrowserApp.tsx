import { StompMarketsGridDemo } from './StompMarketsGridDemo.js';

export function BrowserApp() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-4">
        <span className="font-mono text-[13px] font-semibold">STOMP + MarketsGrid</span>
        <span className="text-[11px] text-[color:var(--ds-text-faint)]">minimal IDataProvider demo</span>
      </header>
      <main className="min-h-0 flex-1">
        <StompMarketsGridDemo />
      </main>
      <footer className="shrink-0 border-t border-[color:var(--ds-border-primary)] px-4 py-1.5 font-mono text-[10px] text-[color:var(--ds-text-faint)]">
        Run <code className="text-[color:var(--ds-text-secondary)]">npm run dev:stomp</code> first (broker :8081)
      </footer>
    </div>
  );
}
