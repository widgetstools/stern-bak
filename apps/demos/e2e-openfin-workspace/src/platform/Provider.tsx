/**
 * Provider.tsx — the OpenFin platform provider window.
 *
 * Mounted by `?view=provider` (which the platform manifest's
 * `providerUrl` points at). Calls `initWorkspace()` from
 * `@wellsfargo-starui/openfin-platform` to bring up Home / Store / Dock /
 * Notifications.
 *
 * Outside OpenFin the component renders a friendly diagnostic so
 * a stray dev-server visit doesn't look broken.
 */
import { useEffect, useState } from 'react';
import { initWorkspace } from '@wellsfargo-starui/openfin-platform';

export function Provider() {
  const [status, setStatus] = useState<'idle' | 'initializing' | 'ready' | 'error' | 'not-openfin'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fin = (globalThis as any).fin;
    if (!fin?.Platform?.getCurrentSync) {
      setStatus('not-openfin');
      return;
    }
    setStatus('initializing');
    (async () => {
      try {
        await initWorkspace({
          onProgress: (msg: string) => {
            // eslint-disable-next-line no-console
            console.log('[provider]', msg);
          },
        });
        setStatus('ready');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();
  }, []);

  return (
    <div
      data-testid="openfin-workspace-provider-status"
      data-status={status}
      style={{ padding: 24, fontFamily: 'IBM Plex Mono, monospace', fontSize: 13 }}
    >
      <h1 style={{ fontSize: 18, margin: '0 0 12px' }}>openfin-workspace provider</h1>
      <div>status: <strong>{status}</strong></div>
      {errorMsg && (
        <pre style={{ color: 'var(--ds-accent-negative)', marginTop: 8 }}>{errorMsg}</pre>
      )}
      {status === 'not-openfin' && (
        <p style={{ marginTop: 12, color: 'var(--ds-text-secondary)' }}>
          This window is only useful inside the OpenFin runtime. Launch via
          <code style={{ marginLeft: 6 }}>npm run dev:openfin:openfin-workspace</code>.
        </p>
      )}
    </div>
  );
}
