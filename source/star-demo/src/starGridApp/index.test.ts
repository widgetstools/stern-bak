import { describe, expect, it } from 'vitest';
import * as starGridIndex from './index';

describe('starGridApp index', () => {
  it('re-exports public API', () => {
    expect(starGridIndex.StarGridApp).toBeDefined();
    expect(starGridIndex.StarGridAppProvider).toBeDefined();
    expect(starGridIndex.useStarGridApp).toBeDefined();
    expect(starGridIndex.useStarGridHost).toBeDefined();
    expect(starGridIndex.buildGridHostContext).toBeDefined();
    expect(starGridIndex.storageFactoryForPersistence).toBeDefined();
    expect(starGridIndex.defineStarGridPlugin).toBeDefined();
  });
});
