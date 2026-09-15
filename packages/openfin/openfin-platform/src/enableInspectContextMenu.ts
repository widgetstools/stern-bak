/**
 * Keep right-click → Inspect available on every platform view and window.
 *
 * A plain OpenFin window has the menu by default (`@openfin/core`:
 * `contextMenu` is `@default true`, "Gives access to the devtools for the
 * window"). Workspace Platform Browser windows do NOT: its window-options
 * normalizer (`@openfin/workspace-platform` 23.2.25) ends with
 *
 *     contextMenuOptions?.template?.length > 0
 *       ? template = template.filter((e) => e !== 'print')
 *       : contextMenuOptions = { template: [], enabled: false }
 *
 * — so unless a NON-EMPTY template is already present it writes the menu
 * off outright, and a supplied one survives untouched but for `print`.
 *
 * That also disposes of the older knobs: `contextMenu` and
 * `contextMenuSettings` are both marked `@deprecated Superseded by
 * contextMenuOptions`, so a window carrying
 * `contextMenuSettings: { enable: true, devtools: true }` alongside
 * `contextMenuOptions: { template: [], enabled: false }` gets no menu —
 * the seeded star-demo window is exactly that shape.
 *
 * Supplying the template is therefore the only lever, and it has to run at
 * creation like the throttling policy next door: OpenFin persists each
 * view's fully-RESOLVED options, so every layout saved while the menu was
 * off carries `{ template: [], enabled: false }` and would otherwise keep
 * restoring it forever.
 */

/** `PrebuiltContextMenuItem` values (`@openfin/core`) this platform offers. */
export const INSPECT_CONTEXT_MENU_TEMPLATE = [
  'cut',
  'copy',
  'paste',
  'selectAll',
  'separator',
  'reload',
  'inspect',
] as const;

interface ContextMenuCarrier {
  contextMenuOptions?: { enabled?: boolean; template?: string[] };
}

/**
 * Force an Inspect-bearing context menu onto view/window creation options.
 *
 * A caller's own non-empty template is kept and only topped up with the
 * two entries this exists to guarantee — deliberate menus stay theirs.
 * An empty template is not a preference, it is the normalizer's off
 * switch, so it is replaced.
 */
export function enableInspectContextMenu<T extends ContextMenuCarrier>(opts: T): T {
  const existing = opts.contextMenuOptions?.template;
  const template = existing && existing.length > 0 ? [...existing] : [...INSPECT_CONTEXT_MENU_TEMPLATE];
  for (const required of ['inspect', 'reload']) {
    if (!template.includes(required)) template.push(required);
  }
  opts.contextMenuOptions = { enabled: true, template };
  return opts;
}

/** Layout-tree twin of {@link enableInspectContextMenu} (snapshot restore). */
export function enableInspectContextMenuInLayout(layout: unknown): void {
  if (!layout || typeof layout !== 'object') return;
  const node = layout as Record<string, unknown>;

  if (node.componentName === 'view' || 'contextMenuOptions' in node) {
    enableInspectContextMenu(node as ContextMenuCarrier);
  }

  const componentState = node.componentState;
  if (componentState && typeof componentState === 'object') {
    enableInspectContextMenuInLayout(componentState);
  }
  const content = node.content;
  if (Array.isArray(content)) {
    for (const child of content) enableInspectContextMenuInLayout(child);
  }
}
