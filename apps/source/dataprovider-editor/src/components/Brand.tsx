export function Brand() {
  return (
    <div className="flex items-center gap-2.5 pr-3">
      <div
        aria-hidden
        className="grid h-6 w-6 place-items-center rounded-sm bg-[color:var(--ds-primary)] text-[color:var(--ds-primary-foreground)] shadow-[var(--ds-elevation-card)]"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="square"
          aria-hidden
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </div>
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-[12px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
          DataProvider Editor + ConfigBrowser
        </span>
        <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-[color:var(--ds-text-faint)]">
          StarUI · composition demo
        </span>
      </div>
    </div>
  );
}
