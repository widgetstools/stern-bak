/**
 * ConfigBrowser popup entry — renders ONLY when the bundle loads with
 * `?configBrowser=1` in the URL. Opened from App.tsx via `window.open`.
 *
 * Why a separate entry:
 *   - The popup runs in its own browser window. Closing is natural
 *     (OS window close button, Ctrl+W, etc.) — no custom close UI
 *     needed. Main grid stays visible behind.
 *   - ConfigBrowserPanel itself self-bootstraps its ConfigManager via
 *     `getConfigManager()`'s lazy path. Same-origin = same Dexie DB,
 *     so data is shared across windows automatically.
 *   - Host env (appId, configServiceUrl) is carried via `?hostEnv=...`
 *     query string so ConfigBrowser's `readHostEnv()` returns the
 *     demo's appId — without this it would fall back to `dev-host`
 *     and see none of the demo's rows.
 */
import { useEffect } from 'react';
import { ConfigBrowserPanel } from '@wellsfargo-starui/config-browser';
import { X } from 'lucide-react';

export function ConfigBrowserPopout() {
  // Set a distinct title so users can tell windows apart in the OS
  // taskbar / window switcher when they have both open.
  useEffect(() => {
    document.title = 'Config Browser · MarketsGrid Demo';
  }, []);

  // Theme sync is owned by the runtime. The popup is mounted under the
  // same `<AppShell>` as the parent app, so its `BrowserRuntime`
  // listens to the `starui:theme` BroadcastChannel and applies updates
  // from the parent window automatically. Initial paint reads from the
  // canonical localStorage key via `applyTheme(getTheme())` in main.tsx.
  // Previously this component hand-rolled `localStorage` + a `storage`
  // event listener against the legacy `gc-theme` key.

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--background)',
    }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--ds-font-sans)',
        }}>
          Config Browser · demo-configservice
        </span>
        <button
          type="button"
          onClick={() => window.close()}
          title="Close"
          data-testid="config-browser-popout-close"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 5,
            border: '1px solid var(--border)',
            background: 'var(--secondary)',
            color: 'var(--foreground)',
            cursor: 'pointer',
          }}
        >
          <X size={13} strokeWidth={1.75} />
        </button>
      </header>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ConfigBrowserPanel />
      </div>
    </div>
  );
}
