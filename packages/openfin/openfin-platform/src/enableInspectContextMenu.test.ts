import { describe, expect, it } from 'vitest';
import {
  enableInspectContextMenu,
  enableInspectContextMenuInLayout,
  INSPECT_CONTEXT_MENU_TEMPLATE,
} from './enableInspectContextMenu';

/**
 * The shape these assertions defend is the one Workspace Platform's window
 * normalizer produces when no template is supplied — `{ template: [],
 * enabled: false }`, which is a context menu that never opens, and which
 * saved layouts then restore forever.
 */
describe('enableInspectContextMenu', () => {
  it('installs an Inspect-bearing template on bare options', () => {
    const opts = enableInspectContextMenu({} as { contextMenuOptions?: unknown });
    expect(opts.contextMenuOptions).toEqual({
      enabled: true,
      template: [...INSPECT_CONTEXT_MENU_TEMPLATE],
    });
  });

  it("replaces the platform's empty-template off switch", () => {
    // The whole point: an empty template is not a preference, it is how
    // `@openfin/workspace-platform` writes "no menu here".
    const opts = { contextMenuOptions: { enabled: false, template: [] as string[] } };
    enableInspectContextMenu(opts);
    expect(opts.contextMenuOptions.enabled).toBe(true);
    expect(opts.contextMenuOptions.template).toContain('inspect');
  });

  it("keeps a caller's own template and only tops up what it guarantees", () => {
    const opts = { contextMenuOptions: { enabled: false, template: ['copy', 'paste'] } };
    enableInspectContextMenu(opts);
    expect(opts.contextMenuOptions.template).toEqual(['copy', 'paste', 'inspect', 'reload']);
  });

  it('does not duplicate entries a template already carries', () => {
    const opts = { contextMenuOptions: { enabled: true, template: ['inspect', 'reload', 'copy'] } };
    enableInspectContextMenu(opts);
    expect(opts.contextMenuOptions.template).toEqual(['inspect', 'reload', 'copy']);
  });

  it('offers only real PrebuiltContextMenuItem values', () => {
    // A bogus entry is not rejected by OpenFin, it just silently yields a
    // menu missing that item — so the template is pinned against the union.
    const prebuilt = new Set([
      'separator', 'undo', 'redo', 'cut', 'copy', 'copyImage', 'paste', 'selectAll',
      'spellCheck', 'inspect', 'reload', 'navigateForward', 'navigateBack', 'print',
      'snapToTop', 'snapToBottom',
    ]);
    for (const item of INSPECT_CONTEXT_MENU_TEMPLATE) expect(prebuilt).toContain(item);
  });
});

describe('enableInspectContextMenuInLayout', () => {
  const layout = () => ({
    content: [{
      content: [{
        componentName: 'view',
        componentState: {
          name: 'blotter-1',
          contextMenuOptions: { enabled: false, template: [] as string[] },
        },
      }],
    }],
  });

  it('reaches a view buried in a restored layout tree', () => {
    const tree = layout();
    enableInspectContextMenuInLayout(tree);
    const state = tree.content[0].content[0].componentState;
    expect(state.contextMenuOptions.enabled).toBe(true);
    expect(state.contextMenuOptions.template).toContain('inspect');
  });

  it('leaves nodes that carry no context-menu options alone', () => {
    const tree = { content: [{ componentName: 'stack', componentState: { name: 'x' } }] };
    enableInspectContextMenuInLayout(tree);
    expect(tree.content[0].componentState).toEqual({ name: 'x' });
  });

  it('survives the shapes a snapshot can legitimately hold', () => {
    expect(() => {
      enableInspectContextMenuInLayout(undefined);
      enableInspectContextMenuInLayout(null);
      enableInspectContextMenuInLayout('not a layout');
      enableInspectContextMenuInLayout({ content: [] });
    }).not.toThrow();
  });
});
