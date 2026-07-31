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
    void initWorkspace()
      .then(() => setStatus('ready'))
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
  }, []);

  return (
    <div
      data-testid="demo-stomp-provider-status"
      data-status={status}
      className="p-6 font-mono text-[13px] text-[color:var(--ds-text-primary)]"
    >
      <h1 className="mb-2 text-lg font-semibold">demo-stomp-markets-grid provider</h1>
      <div>status: <strong>{status}</strong></div>
      {errorMsg && (
        <pre className="mt-2 text-[color:var(--ds-accent-negative)]">{errorMsg}</pre>
      )}
      {status === 'not-openfin' && (
        <p className="mt-3 text-[color:var(--ds-text-secondary)]">
          Launch via <code>npm run dev:openfin:demo-stomp-markets-grid</code>
        </p>
      )}
    </div>
  );
}
