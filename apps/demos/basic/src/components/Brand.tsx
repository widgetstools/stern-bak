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
          <path d="M3 18 L9 12 L13 16 L21 6" />
          <path d="M15 6 L21 6 L21 12" />
        </svg>
      </div>
      <span className="font-mono text-[13px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
        Bond Blotter
      </span>
    </div>
  );
}
