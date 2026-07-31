import { ConfigBrowserPanel as StarConfigBrowserPanel } from '@wellsfargo-starui/config-browser';

export function ConfigBrowserPanel() {
  return (
    // Same `transform: translateZ(0)` containing-block trick as
    // HostedGridPanel — StarUI's ConfigBrowserPanel root is
    // `className="fixed inset-0 …"` (designed for a full popout
    // window). Making this wrapper a fixed-position containing block
    // pins the browser to this dock-manager panel instead of the
    // viewport.
    <div
      className="relative flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]"
      style={{ transform: 'translateZ(0)' }}
    >
      <StarConfigBrowserPanel />
    </div>
  );
}
