import { describe, expect, it } from 'vitest';
import { savedFiltersModule, SAVED_FILTERS_MODULE_ID } from './index';

describe('savedFiltersModule', () => {
  it('registers with expected metadata', () => {
    expect(savedFiltersModule.id).toBe(SAVED_FILTERS_MODULE_ID);
    expect(savedFiltersModule.schemaVersion).toBe(2);
  });

  it('deserialize drops malformed filter records', () => {
    const raw = {
      filters: [
        { id: 'ok', label: 'Active', active: true, filterModel: { status: { filterType: 'text' } } },
        { id: '', label: 'Bad id', active: true, filterModel: {} },
        { id: 'no-model', label: 'Missing model', active: false },
      ],
    };
    const state = savedFiltersModule.deserialize!(raw);
    expect(state.filters).toHaveLength(1);
    expect((state.filters[0] as { id: string }).id).toBe('ok');
  });

  it('migrate coerces legacy active flags', () => {
    const raw = {
      filters: [{ id: 'f1', label: 'Legacy', active: 1, filterModel: { x: 1 } }],
    };
    const state = savedFiltersModule.migrate!(raw);
    expect((state.filters[0] as { active: boolean }).active).toBe(true);
  });
});
