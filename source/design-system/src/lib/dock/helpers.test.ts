import { describe, expect, it } from 'vitest';
import { collectAllPanelsOrdered } from '@widgetstools/dock-manager-core';
import { base, p, sp, tg } from './helpers';

describe('dock helpers', () => {
  it('builds panel, tabgroup, and split nodes', () => {
    expect(p('a', 'Title', 'widget')).toEqual({
      id: 'a',
      title: 'Title',
      widgetType: 'widget',
      closable: false,
    });
    expect(tg('g1', ['a', 'b'], 'b')).toEqual({
      type: 'tabgroup',
      id: 'g1',
      panels: ['a', 'b'],
      activePanel: 'b',
    });
    const child = tg('g2', ['c']);
    const split = sp('s1', 'horizontal', [60, 40], [child]);
    expect(split.type).toBe('split');
    expect(split.direction).toBe('horizontal');
  });

  it('base assembles docked placements for all panels', () => {
    const layout = sp('root', 'vertical', [100], [tg('g', ['panel-a', 'panel-b'])]);
    const state = base(
      layout,
      {
        'panel-a': p('panel-a', 'A', 'blotter'),
        'panel-b': p('panel-b', 'B', 'priceChart'),
      },
      'panel-a',
    );
    const ids = collectAllPanelsOrdered(state.layout);
    expect(ids).toEqual(['panel-a', 'panel-b']);
    expect(state.placements.get('panel-a')).toEqual({ type: 'docked', groupId: 'g' });
    expect(state.activePaneId).toBe('panel-a');
  });
});
