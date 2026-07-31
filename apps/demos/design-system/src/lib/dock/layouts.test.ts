import { describe, expect, it } from 'vitest';
import { collectAllPanelsOrdered } from '@widgetstools/dock-manager-core';
import { TAB_LAYOUTS } from './layouts';
import { WIDGETS } from './registry';

describe('dock layouts', () => {
  it('every layout references only registered widget ids and has placements for all panels', () => {
    const known = new Set(Object.keys(WIDGETS));
    for (const [tab, build] of Object.entries(TAB_LAYOUTS)) {
      const state = build();
      const ids = collectAllPanelsOrdered(state.layout);
      expect(ids.length, `${tab} has panels`).toBeGreaterThan(0);
      for (const id of ids) {
        expect(state.panels.has(id), `${tab}:${id} in panels`).toBe(true);
        expect(state.placements.has(id), `${tab}:${id} placed`).toBe(true);
        expect(known.has(state.panels.get(id)!.widgetType!), `${tab}:${id} widgetType registered`).toBe(true);
      }
    }
  });

  it('split sizes sum to 100', () => {
    const walk = (n: { type: string; sizes?: number[]; children?: unknown[] }) => {
      if (n.type === 'split') {
        expect(n.sizes!.reduce((a, b) => a + b, 0)).toBe(100);
        (n.children as typeof n[]).forEach(walk);
      }
    };
    for (const build of Object.values(TAB_LAYOUTS)) walk(build().layout as never);
  });
});
