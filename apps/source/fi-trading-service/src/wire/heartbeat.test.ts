import { describe, expect, it } from 'vitest';

import { negotiateHeartbeat, parseHeartbeatHeader } from './heartbeat.js';

describe('parseHeartbeatHeader', () => {
  it('parses a well-formed header', () => {
    expect(parseHeartbeatHeader('4000,5000')).toEqual([4000, 5000]);
  });

  it('treats absent, malformed and non-positive values as disabled', () => {
    expect(parseHeartbeatHeader(undefined)).toEqual([0, 0]);
    expect(parseHeartbeatHeader('0,0')).toEqual([0, 0]);
    expect(parseHeartbeatHeader('abc')).toEqual([0, 0]);
    expect(parseHeartbeatHeader('-1,-2')).toEqual([0, 0]);
    expect(parseHeartbeatHeader('4000')).toEqual([4000, 0]);
  });
});

describe('negotiateHeartbeat', () => {
  it('takes the larger of what the sender offers and the receiver wants', () => {
    expect(negotiateHeartbeat('4000,4000', 10000, 10000)).toEqual({
      sendEveryMs: 10000,
      expectEveryMs: 10000,
    });
    expect(negotiateHeartbeat('30000,30000', 10000, 10000)).toEqual({
      sendEveryMs: 30000,
      expectEveryMs: 30000,
    });
  });

  it('disables a direction when either side declines it', () => {
    expect(negotiateHeartbeat('0,0', 10000, 10000)).toEqual({ sendEveryMs: 0, expectEveryMs: 0 });
    expect(negotiateHeartbeat('4000,4000', 0, 0)).toEqual({ sendEveryMs: 0, expectEveryMs: 0 });
    expect(negotiateHeartbeat('4000,0', 10000, 10000).sendEveryMs).toBe(0);
    expect(negotiateHeartbeat('0,4000', 10000, 10000).expectEveryMs).toBe(0);
  });
});
