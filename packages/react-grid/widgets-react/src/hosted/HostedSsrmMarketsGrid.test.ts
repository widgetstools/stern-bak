import { describe, expect, it } from 'vitest';
import { HostedMarketsGrid } from './HostedMarketsGrid.js';
import { HostedSsrmMarketsGrid } from './HostedSsrmMarketsGrid.js';

describe('HostedSsrmMarketsGrid', () => {
  it('is the hosted MarketsGrid chrome (catalog type picks SSRM)', () => {
    expect(HostedSsrmMarketsGrid).toBe(HostedMarketsGrid);
  });
});
