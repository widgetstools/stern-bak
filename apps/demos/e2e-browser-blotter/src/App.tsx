/**
 * Browser-blotter App — selects the runtime stack based on the
 * resolved URL mode and renders MarketsGrid.
 *
 *   standalone — in-app row generator + bare MarketsGrid (no SharedWorker)
 *   provider   — SharedWorker hub + HostedMarketsGrid + mock provider
 *   config     — ConfigManager + StarGridApp shell + in-app row generator
 *   full       — hub + HostedMarketsGrid with full toolbar chrome
 */
import type { GridApi } from 'ag-grid-community';
import { StandaloneBlotter } from './StandaloneBlotter';
import { ConfigBlotter, HubBlotter } from './HubBlotter';
import { GRID_ID, type RowShape } from './blotterColumns';

export type AppMode = 'standalone' | 'provider' | 'config' | 'full';

export { GRID_ID };

interface ModeBannerProps {
  mode: AppMode;
}

function ModeBanner({ mode }: ModeBannerProps) {
  return (
    <div
      data-testid="browser-blotter-mode-banner"
      data-mode={mode}
      data-status="wired"
      style={{
        padding: '8px 12px',
        background: 'var(--ds-surface-primary)',
        color: 'var(--ds-text-primary)',
        borderBottom: '1px solid var(--ds-border-secondary)',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 12,
        display: 'flex',
        gap: 16,
        alignItems: 'center',
      }}
    >
      <span data-testid="browser-blotter-mode-label">mode: <strong>{mode}</strong></span>
      <span style={{ opacity: 0.6 }}>•</span>
      <span data-testid="browser-blotter-grid-id">gridId: <code>{GRID_ID}</code></span>
    </div>
  );
}

function exposeGridApi(api: GridApi<RowShape>) {
  (window as unknown as { __browserBlotterApi?: GridApi<RowShape> }).__browserBlotterApi = api;
}

export function App({ mode }: { mode: AppMode }) {
  const body = (() => {
    switch (mode) {
      case 'provider':
        return <HubBlotter fullChrome={false} />;
      case 'config':
        return <ConfigBlotter onGridReady={exposeGridApi} />;
      case 'full':
        return <HubBlotter fullChrome />;
      default:
        return <StandaloneBlotter onGridReady={exposeGridApi} />;
    }
  })();

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <ModeBanner mode={mode} />
      <div style={{ flex: 1, minHeight: 0 }} data-testid="browser-blotter-grid-host">
        {body}
      </div>
    </div>
  );
}
