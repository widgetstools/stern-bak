import { describe, expect, it } from 'vitest';
import { buildStreamSafeComponents } from './buildStreamSafeComponents';

describe('buildStreamSafeComponents', () => {
  it('includes all filters by default', () => {
    const map = buildStreamSafeComponents([], true);
    expect(map).toHaveProperty('streamSafeDate');
    expect(map).toHaveProperty('streamSafeText');
  });

  it('omits date filter when not referenced and includeAll is false', () => {
    const map = buildStreamSafeComponents(
      [{ field: 'price', floatingFilterComponent: 'streamSafeNumber' }],
      false,
    );
    expect(map).not.toHaveProperty('streamSafeDate');
    expect(map).toHaveProperty('streamSafeNumber');
  });

  it('includes date filter when column uses agDateColumnFilter', () => {
    const map = buildStreamSafeComponents(
      [{ field: 'asOf', filter: 'agDateColumnFilter' }],
      false,
    );
    expect(map).toHaveProperty('streamSafeDate');
  });
});
