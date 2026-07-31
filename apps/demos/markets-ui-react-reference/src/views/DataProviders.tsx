/**
 * DataProviders — admin page that mounts the v2 `<DataProviderEditor>`
 * so users can author STOMP / REST / Mock / AppData providers.
 *
 * This view is the popout target for `openProviderEditorPopout()`.
 * The popout helper passes `?id=<providerId>` when editing an
 * existing row; we read it via `URLSearchParams` and forward as
 * `initialProviderId` so the form snaps to that row on mount.
 *
 * Storage flows through `<DataHubProvider>` → the hub ConfigManager (Dexie / IndexedDB).
 *
 * Layout: a thin top bar with a back link, then the editor fills
 * the rest of the window.
 */

import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { DataProviderEditor } from '@wellsfargo-starui/widgets-react/provider-editor';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';

// userId is single-user-pinned across the codebase — no env override,
// no customData/URL pickup. See LOGGED_IN_USER_ID in runtime-port.
const userId = LOGGED_IN_USER_ID;

function DataProviders() {
  const [params] = useSearchParams();
  const initialProviderId = useMemo(() => params.get('id'), [params]);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Data Providers · Markets UI';
    return () => { document.title = prev; };
  }, []);

  // The shell's `body { padding: 10px }` (set in index.css for the
  // home page chrome) leaks here as 10px gutters around the popout
  // and pushes h-screen content past the viewport — producing the
  // OS-default page-level scrollbars. Zero body padding/margin on
  // mount so the editor fills the popout flush, then restore on
  // unmount so other routes keep their gutters.
  useEffect(() => {
    const bodyStyle = document.body.style;
    const prevPadding = bodyStyle.padding;
    const prevMargin = bodyStyle.margin;
    const prevOverflow = bodyStyle.overflow;
    bodyStyle.padding = '0';
    bodyStyle.margin = '0';
    bodyStyle.overflow = 'hidden';
    return () => {
      bodyStyle.padding = prevPadding;
      bodyStyle.margin = prevMargin;
      bodyStyle.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
        <span className="text-[11px] text-muted-foreground">
          user <code className="font-mono">{userId}</code> · storage <code className="font-mono">ConfigManager</code>
        </span>
      </header>
      <div className="flex-1 min-h-0">
        <DataProviderEditor userId={userId} initialProviderId={initialProviderId} />
      </div>
    </div>
  );
}

export default DataProviders;
