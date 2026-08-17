/**
 * The one toast surface a grid owns — and the only thing under `packages/`
 * that mounts a toaster.
 *
 * **Why the grid and not the app.** The failure this exists for is raised by
 * the editing funnels through the per-grid write-back registry, which no
 * application code can reach. Leaving the mount to the app is what the tree
 * already did, and the result was a revert path with nothing on the other end
 * of it: `sonner` has been a declared dependency and `SonnerToaster` an export
 * since before the write-back landed, and nothing under `packages/` ever
 * rendered one.
 *
 * **Why one per document rather than one per grid.** `sonner` keeps its toast
 * queue in module state and every mounted `<Toaster/>` renders all of it, so
 * two grids in one window would show every toast twice. The instances order
 * themselves and only the first live one renders; when it unmounts the next
 * takes over, so a grid is never left without a surface.
 *
 * **Why `document.body` is the right portal even under OpenFin.** A view is
 * created with `platform.createView({ url })` — its own webcontents, its own
 * document. One toaster per document is therefore one per view, which is what
 * is wanted: a rejected edit belongs to the window that made it. Hoisting a
 * single toaster into the platform window would do the opposite, announcing
 * one view's failure over another view's grid.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SonnerToaster } from '@wellsfargo-starui/react';

/** Mount order. `live[0]` is the instance that renders. */
const live: symbol[] = [];
const subscribers = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  subscribers.add(onStoreChange);
  return () => {
    subscribers.delete(onStoreChange);
  };
}

function announce(): void {
  for (const notify of [...subscribers]) notify();
}

/**
 * Same read as the design-system's cell renderers use, and the same default:
 * `data-theme` is authoritative here, `prefers-color-scheme` is not. Sonner's
 * own `theme="system"` would consult the OS instead and paint a light toast
 * over a dark grid whenever the two disagree.
 */
function readDocumentTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';
}

function useDocumentTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState(readDocumentTheme);

  useEffect(() => {
    const sync = () => setTheme(readDocumentTheme());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

function useIsToastOwner(): boolean {
  const tokenRef = useRef<symbol | null>(null);
  tokenRef.current ??= Symbol('grid-toast-surface');
  const token = tokenRef.current;

  useEffect(() => {
    live.push(token);
    announce();
    return () => {
      const at = live.indexOf(token);
      if (at >= 0) live.splice(at, 1);
      announce();
    };
  }, [token]);

  return useSyncExternalStore(
    subscribe,
    () => live[0] === token,
    () => false,
  );
}

export function GridToastSurface() {
  const isOwner = useIsToastOwner();
  const theme = useDocumentTheme();

  if (!isOwner) return null;

  // Colours come from the design-system tokens the shadcn sonner block already
  // maps onto (`bg-background` / `text-foreground` / `border-border`), so the
  // panel is opaque over whatever grid content it lands on in either theme.
  // Sonner's `richColors` is deliberately NOT set: its severity palette is
  // hardcoded HSL inside the library and would paint over those tokens.
  // `closeButton` is not decoration — the stuck message never expires on its
  // own, so dismissing it has to be possible.
  return <SonnerToaster theme={theme} closeButton />;
}

/** Test seam — module state outlives a single render tree. */
export function resetGridToastSurfaceRegistry(): void {
  live.length = 0;
  subscribers.clear();
}
