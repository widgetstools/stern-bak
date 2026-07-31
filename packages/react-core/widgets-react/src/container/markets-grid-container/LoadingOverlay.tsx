/**
 * LoadingOverlay — animated busy indicator shown while the active
 * provider is between subscribe and snapshot delivery.
 *
 * Flat spinner — outer solid ring + inner dashed ring (counter-rotating).
 * No halo, blur, box-shadow, or pulse glow.
 */

export interface LoadingOverlayProps {
  /** Top-line label (e.g. provider name or "Market data"). */
  title?: string;
  /** Sub-label, free-form. Defaults to a connection-aware string. */
  message?: string;
  /** Optional row count — shown when a snapshot is actively streaming. */
  rowCount?: number;
}

export function MarketsGridLoadingOverlay({
  title = 'Loading market data',
  message,
  rowCount,
}: LoadingOverlayProps) {
  const subtitle =
    message ?? (typeof rowCount === 'number'
      ? `Buffering snapshot · ${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'} received`
      : 'Fetching snapshot…');

  return (
    <>
      <style>{OVERLAY_CSS}</style>
      <div
        role="status"
        aria-live="polite"
        aria-label={`${title}. ${subtitle}`}
        className="mui-grid-loading-backdrop"
      >
        <div className="mui-grid-loading-card">
          <div className="mui-grid-loading-spinner" aria-hidden>
            <span className="mui-grid-loading-spinner__ring" />
            <span className="mui-grid-loading-spinner__dash" />
            <span className="mui-grid-loading-spinner__dot" />
          </div>

          <div className="mui-grid-loading-copy">
            <span className="mui-grid-loading-title">{title}</span>
            <span className="mui-grid-loading-subtitle">{subtitle}</span>
          </div>
        </div>
      </div>
    </>
  );
}

const OVERLAY_CSS = `
.mui-grid-loading-backdrop {
  --mui-loading-accent: var(--ds-primary, hsl(var(--primary)));
  --mui-loading-track: var(--ds-border-secondary);

  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  background: color-mix(in srgb, var(--ds-surface-ground) 72%, transparent);
  animation: mui-grid-overlay-fade-in 200ms ease-out;
}

.mui-grid-loading-card {
  display: flex;
  min-width: 240px;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 24px 36px;
  border-radius: 2px;
  border: 1px solid var(--ds-border-primary);
  background: var(--ds-surface-primary);
  box-shadow: none;
  filter: none;
}

.mui-grid-loading-spinner {
  position: relative;
  width: 48px;
  height: 48px;
  box-shadow: none;
  filter: none;
}

.mui-grid-loading-spinner__ring,
.mui-grid-loading-spinner__dash,
.mui-grid-loading-spinner__dot {
  box-shadow: none;
  filter: none;
}

.mui-grid-loading-spinner__ring {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  border: 3px solid var(--mui-loading-track);
  border-top-color: var(--mui-loading-accent);
  animation: mui-grid-overlay-spin-cw 0.9s linear infinite;
}

.mui-grid-loading-spinner__dash {
  position: absolute;
  inset: 12px;
  border-radius: 999px;
  border: 2px dashed color-mix(in srgb, var(--mui-loading-accent) 65%, transparent);
  animation: mui-grid-overlay-spin-ccw 2.4s linear infinite;
}

.mui-grid-loading-spinner__dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin-left: -3px;
  margin-top: -3px;
  border-radius: 999px;
  background: var(--mui-loading-accent);
}

.mui-grid-loading-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.mui-grid-loading-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--ds-text-primary);
}

.mui-grid-loading-subtitle {
  font-family: var(--ds-font-mono, ui-monospace, monospace);
  font-size: 11px;
  letter-spacing: 0.15px;
  color: var(--ds-text-muted);
}

@keyframes mui-grid-overlay-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes mui-grid-overlay-spin-cw {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes mui-grid-overlay-spin-ccw {
  from { transform: rotate(0deg); }
  to   { transform: rotate(-360deg); }
}
`;
