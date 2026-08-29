import { describe, expect, it } from 'vitest';
import { summaryPanelModule, SUMMARY_PANEL_MODULE_ID } from './index.js';

describe('summaryPanelModule', () => {
  it('registers with expected metadata', () => {
    expect(summaryPanelModule.id).toBe(SUMMARY_PANEL_MODULE_ID);
    expect(summaryPanelModule.schemaVersion).toBe(1);
  });

  it('getInitialState starts with no widgets', () => {
    expect(summaryPanelModule.getInitialState()).toEqual({ widgets: [] });
  });

  it('serialize/deserialize round-trips a widget', () => {
    const state = {
      widgets: [
        { id: 'w1', title: 'By sector', kind: 'digest' as const, query: { groupBy: ['sector'] } },
        { id: 'w2', kind: 'chart' as const, query: { groupBy: ['tenorBucket'], aggregate: [{ column: 'dv01', fn: 'sum' as const }] }, chartKind: 'bar' as const },
      ],
    };
    const raw = summaryPanelModule.serialize(state);
    expect(summaryPanelModule.deserialize(raw)).toEqual(state);
  });

  it('deserialize drops malformed widgets', () => {
    const raw = {
      widgets: [
        { id: 'ok', kind: 'digest', query: {} },
        { id: '', kind: 'digest', query: {} }, // blank id
        { id: 'bad-kind', kind: 'nonsense', query: {} }, // invalid kind
        { id: 'no-query', kind: 'chart' }, // missing query
        'not-an-object',
      ],
    };
    const state = summaryPanelModule.deserialize(raw);
    expect(state.widgets).toHaveLength(1);
    expect(state.widgets[0].id).toBe('ok');
  });

  it('deserialize tolerates a missing/malformed root', () => {
    expect(summaryPanelModule.deserialize(undefined)).toEqual({ widgets: [] });
    expect(summaryPanelModule.deserialize({ widgets: 'nonsense' })).toEqual({ widgets: [] });
  });
});
