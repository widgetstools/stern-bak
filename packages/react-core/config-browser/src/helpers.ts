/**
 * Convenience helper for wiring ConfigBrowser into a MarketsGrid's
 * `adminActions` slot.
 *
 * Produces an `AdminAction` with sensible defaults (id, label, icon,
 * description) that the MarketsGrid settings-sheet Tools menu renders
 * as a single entry. Consumer supplies only the `launch` callback —
 * what it means to "open" the Config Browser is fully up to the app:
 * navigate a route, open an OpenFin window, toggle an overlay flag,
 * etc.
 *
 * Usage (React demo, overlay-style launch):
 *
 *   const [browserOpen, setBrowserOpen] = useState(false);
 *
 *   const adminActions = useMemo(() => [
 *     createConfigBrowserAction({
 *       launch: () => setBrowserOpen(true),
 *       visible: user.hasRole('admin'),
 *     }),
 *   ], [user]);
 *
 *   <MarketsGrid ... adminActions={adminActions} />
 *
 *   {browserOpen && <ConfigBrowserOverlay onClose={() => setBrowserOpen(false)} />}
 *
 * Usage (route-based launch):
 *
 *   createConfigBrowserAction({ launch: () => navigate('/config-browser') })
 *
 * Usage (OpenFin window launch):
 *
 *   createConfigBrowserAction({
 *     launch: () => fin.Platform.getCurrentSync().createWindow({
 *       url: '/config-browser',
 *       name: 'config-browser',
 *       defaultWidth: 1280,
 *       defaultHeight: 800,
 *     }),
 *   });
 */
import type { AdminAction } from '@wellsfargo-starui/grid';

export interface CreateConfigBrowserActionOptions {
  /** What happens when the user picks "Config Browser" from the Tools
   *  menu. Consumer decides — route, window, modal, overlay. */
  launch: () => void | Promise<void>;
  /** Override the default id. Needed if the same settings sheet hosts
   *  multiple config-browser entries scoped to different apps. */
  id?: string;
  /** Override the default label. */
  label?: string;
  /** Override the default muted subtitle. */
  description?: string;
  /** Role gate. Default: always visible. Consumer handles the actual
   *  role check and passes the boolean in. */
  visible?: boolean;
}

/** Default id used when the consumer doesn't supply one. Stable for
 *  use as an e2e testid (`admin-action-config-browser`). */
export const CONFIG_BROWSER_ACTION_ID = 'config-browser';

/** Produce an `AdminAction` that launches the ConfigBrowser when
 *  clicked. Shape is identical to hand-rolling the entry; this helper
 *  just supplies defaults + keeps naming consistent across apps. */
export function createConfigBrowserAction(
  opts: CreateConfigBrowserActionOptions,
): AdminAction {
  return {
    id: opts.id ?? CONFIG_BROWSER_ACTION_ID,
    label: opts.label ?? 'Config Browser',
    icon: 'lucide:database',
    description: opts.description ?? 'Inspect and edit raw ConfigService rows',
    onClick: opts.launch,
    visible: opts.visible ?? true,
  };
}
