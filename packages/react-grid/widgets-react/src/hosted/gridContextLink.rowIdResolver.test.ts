import { describe, expect, it } from 'vitest';
import { createRowIdSetFilterResolver } from './gridContextLink.js';

describe('createRowIdSetFilterResolver', () => {
  it('maps broadcast row ids to a set-filter model on the key column', () => {
    const resolve = createRowIdSetFilterResolver('positionId');
    const model = resolve(
      { type: 't', criteria: {}, rowIds: ['P1', 'P2'] },
      null as never,
    );
    expect(model).toEqual({
      positionId: { filterType: 'set', values: ['P1', 'P2'] },
    });
  });

  it('returns null for an empty id set so the link filter clears', () => {
    const resolve = createRowIdSetFilterResolver('positionId');
    expect(resolve({ type: 't', criteria: {}, rowIds: [] }, null as never)).toBeNull();
    expect(resolve({ type: 't', criteria: {} }, null as never)).toBeNull();
  });
});
