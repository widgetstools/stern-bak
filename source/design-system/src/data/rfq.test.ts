import { describe, expect, it } from 'vitest';
import { rfqReducer, EXPIRY_TICKS } from './rfq';
import type { RfqRequest } from './rfq';

// ─── Deterministic stubs ──────────────────────────────────────────────────────
const rngHigh = () => 0.9;   // always returns 0.9
const rngLow  = () => 0.1;   // always returns 0.1
const rngMid  = () => 0.5;   // always returns 0.5

const DEALERS = ['GS', 'JPM'];

function sendPayload(id = 'r1') {
  return {
    id,
    instrumentId: 'i01',
    side: 'buy' as const,
    sizeMM: 5,
    mid: 100,
    dealers: DEALERS,
  };
}

// ─── send ─────────────────────────────────────────────────────────────────────

describe('rfqReducer — send', () => {
  it('appends a pending request with empty quotes and ticks=0', () => {
    const state: RfqRequest[] = [];
    const next = rfqReducer(state, { type: 'send', req: sendPayload() }, rngMid);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('r1');
    expect(next[0].status).toBe('pending');
    expect(next[0].quotes).toEqual([]);
    expect(next[0].ticks).toBe(0);
  });

  it('returns a new array (immutability)', () => {
    const state: RfqRequest[] = [];
    const next = rfqReducer(state, { type: 'send', req: sendPayload() }, rngMid);
    expect(next).not.toBe(state);
  });

  it('preserves existing requests', () => {
    const state: RfqRequest[] = [];
    const s1 = rfqReducer(state, { type: 'send', req: sendPayload('r1') }, rngMid);
    const s2 = rfqReducer(s1, { type: 'send', req: sendPayload('r2') }, rngMid);
    expect(s2).toHaveLength(2);
    expect(s2[0].id).toBe('r1');
    expect(s2[1].id).toBe('r2');
  });
});

// ─── tick ─────────────────────────────────────────────────────────────────────

describe('rfqReducer — tick', () => {
  it('increments ticks on each tick action', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload() }, rngMid);
    const s1 = rfqReducer(s0, { type: 'tick' }, rngMid);
    expect(s1[0].ticks).toBe(1);
    const s2 = rfqReducer(s1, { type: 'tick' }, rngMid);
    expect(s2[0].ticks).toBe(2);
  });

  it('streams in dealer quotes stochastically (rngHigh triggers quote arrival)', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload() }, rngHigh);
    // rngHigh → quoteProb will be high and rng() < prob will be satisfied
    let s = s0;
    for (let i = 0; i < 5; i++) {
      s = rfqReducer(s, { type: 'tick' }, rngHigh);
    }
    // At least one dealer should have quoted after 5 ticks with high rng
    expect(s[0].quotes.length).toBeGreaterThan(0);
  });

  it('flips status to quoted once at least one dealer has responded', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload() }, rngHigh);
    let s = s0;
    let found = false;
    for (let i = 0; i < 10; i++) {
      s = rfqReducer(s, { type: 'tick' }, rngHigh);
      if (s[0].status === 'quoted') { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it('auto-cancels request after EXPIRY_TICKS ticks', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload() }, rngLow);
    let s = s0;
    // Use rngLow so no quotes arrive (keeps status pending to test expiry path)
    // rngLow=0.1, quoteProb = 0.25 + 0.1*0.35 = 0.285, then rng()=0.1 < 0.285 is true
    // So some quotes may arrive, but the expiry should still trigger
    for (let i = 0; i < EXPIRY_TICKS + 1; i++) {
      s = rfqReducer(s, { type: 'tick' }, rngLow);
    }
    expect(s[0].status).toBe('cancelled');
  });

  it('does not modify done or cancelled requests on tick', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload() }, rngMid);
    const sCancelled = rfqReducer(s0, { type: 'cancel', id: 'r1' }, rngMid);
    const sTicked = rfqReducer(sCancelled, { type: 'tick' }, rngHigh);
    expect(sTicked[0].status).toBe('cancelled');
    expect(sTicked[0].ticks).toBe(0); // ticks not incremented on cancelled
  });

  it('returns a new array on tick (immutability)', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload() }, rngMid);
    const s1 = rfqReducer(s0, { type: 'tick' }, rngMid);
    expect(s1).not.toBe(s0);
  });

  it('quotes cluster around the request mid (market never crosses)', () => {
    let s = rfqReducer([], { type: 'send', req: sendPayload() }, rngHigh);
    for (let i = 0; i < 8; i++) s = rfqReducer(s, { type: 'tick' }, rngHigh);
    const live = s[0].quotes.filter((q) => q.status === 'live');
    expect(live.length).toBeGreaterThan(0);
    const bestBid = Math.max(...live.map((q) => q.bid));
    const bestAsk = Math.min(...live.map((q) => q.ask));
    // With a stable mid, the best bid must not exceed the best ask (no crossed/negative spread).
    expect(bestBid).toBeLessThanOrEqual(bestAsk);
    // And every quote sits within a tight band around the mid (100).
    for (const q of live) {
      expect(q.bid).toBeGreaterThan(99);
      expect(q.ask).toBeLessThan(101);
    }
  });
});

// ─── hit / lift ───────────────────────────────────────────────────────────────

describe('rfqReducer — hit', () => {
  /** Pump ticks until at least one dealer quote appears for 'GS'. */
  function getQuotedState() {
    let s = rfqReducer([], { type: 'send', req: sendPayload() }, rngHigh);
    for (let i = 0; i < 15; i++) {
      s = rfqReducer(s, { type: 'tick' }, rngHigh);
      if (s[0].quotes.find((q) => q.dealer === 'GS')) break;
    }
    return s;
  }

  it('sets request status to done and records exec with action=hit', () => {
    const s0 = getQuotedState();
    if (!s0[0].quotes.find((q) => q.dealer === 'GS')) return; // skip if no GS quote
    const s1 = rfqReducer(s0, { type: 'hit', id: 'r1', dealer: 'GS' }, rngMid);
    expect(s1[0].status).toBe('done');
    expect(s1[0].exec?.dealer).toBe('GS');
    expect(s1[0].exec?.action).toBe('hit');
  });

  it('hit price equals the dealer bid price', () => {
    const s0 = getQuotedState();
    const gsQuote = s0[0].quotes.find((q) => q.dealer === 'GS');
    if (!gsQuote) return;
    const s1 = rfqReducer(s0, { type: 'hit', id: 'r1', dealer: 'GS' }, rngMid);
    expect(s1[0].exec?.price).toBe(gsQuote.bid);
  });

  it('marks executed dealer quote as done, others as stale', () => {
    const s0 = getQuotedState();
    const gsQuote = s0[0].quotes.find((q) => q.dealer === 'GS');
    if (!gsQuote) return;
    const s1 = rfqReducer(s0, { type: 'hit', id: 'r1', dealer: 'GS' }, rngMid);
    for (const q of s1[0].quotes) {
      if (q.dealer === 'GS') expect(q.status).toBe('done');
      else expect(q.status).toBe('stale');
    }
  });
});

describe('rfqReducer — lift', () => {
  function getQuotedState() {
    let s = rfqReducer([], { type: 'send', req: sendPayload() }, rngHigh);
    for (let i = 0; i < 15; i++) {
      s = rfqReducer(s, { type: 'tick' }, rngHigh);
      if (s[0].quotes.find((q) => q.dealer === 'GS')) break;
    }
    return s;
  }

  it('sets status to done and records exec with action=lift', () => {
    const s0 = getQuotedState();
    if (!s0[0].quotes.find((q) => q.dealer === 'GS')) return;
    const s1 = rfqReducer(s0, { type: 'lift', id: 'r1', dealer: 'GS' }, rngMid);
    expect(s1[0].status).toBe('done');
    expect(s1[0].exec?.action).toBe('lift');
  });

  it('lift price equals the dealer ask price', () => {
    const s0 = getQuotedState();
    const gsQuote = s0[0].quotes.find((q) => q.dealer === 'GS');
    if (!gsQuote) return;
    const s1 = rfqReducer(s0, { type: 'lift', id: 'r1', dealer: 'GS' }, rngMid);
    expect(s1[0].exec?.price).toBe(gsQuote.ask);
  });
});

// ─── cancel ───────────────────────────────────────────────────────────────────

describe('rfqReducer — cancel', () => {
  it('cancels a pending request by id', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload() }, rngMid);
    const s1 = rfqReducer(s0, { type: 'cancel', id: 'r1' }, rngMid);
    expect(s1[0].status).toBe('cancelled');
  });

  it('does not cancel a done request', () => {
    let s = rfqReducer([], { type: 'send', req: sendPayload() }, rngHigh);
    for (let i = 0; i < 15; i++) {
      s = rfqReducer(s, { type: 'tick' }, rngHigh);
      if (s[0].quotes.find((q) => q.dealer === 'GS')) break;
    }
    if (!s[0].quotes.find((q) => q.dealer === 'GS')) return;
    const sDone = rfqReducer(s, { type: 'hit', id: 'r1', dealer: 'GS' }, rngMid);
    const sCancelled = rfqReducer(sDone, { type: 'cancel', id: 'r1' }, rngMid);
    expect(sCancelled[0].status).toBe('done'); // not overwritten
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe('rfqReducer — clear', () => {
  it('removes done and cancelled requests', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload('r1') }, rngMid);
    const s1 = rfqReducer(s0, { type: 'send', req: sendPayload('r2') }, rngMid);
    const s2 = rfqReducer(s1, { type: 'cancel', id: 'r1' }, rngMid);
    const s3 = rfqReducer(s2, { type: 'clear' }, rngMid);
    expect(s3.find((r) => r.id === 'r1')).toBeUndefined();
    expect(s3.find((r) => r.id === 'r2')).toBeDefined(); // still pending
  });

  it('keeps pending and quoted requests after clear', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload('r1') }, rngMid);
    // r1 stays pending with rngMid — low quote prob
    // Pump a few ticks to make it quoted
    let s = s0;
    for (let i = 0; i < 5; i++) s = rfqReducer(s, { type: 'tick' }, rngHigh);
    const s1 = rfqReducer(s, { type: 'clear' }, rngMid);
    // r1 is either quoted or pending — not cleared
    expect(s1).toHaveLength(1);
  });

  it('returns empty array when all requests are terminal', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload('r1') }, rngMid);
    const s1 = rfqReducer(s0, { type: 'cancel', id: 'r1' }, rngMid);
    const s2 = rfqReducer(s1, { type: 'clear' }, rngMid);
    expect(s2).toHaveLength(0);
  });
});

// ─── Immutability ─────────────────────────────────────────────────────────────

describe('rfqReducer — immutability', () => {
  it('each action returns a new array reference', () => {
    const s0: RfqRequest[] = [];
    const s1 = rfqReducer(s0, { type: 'send', req: sendPayload() }, rngMid);
    expect(s1).not.toBe(s0);

    const s2 = rfqReducer(s1, { type: 'tick' }, rngMid);
    expect(s2).not.toBe(s1);

    const s3 = rfqReducer(s2, { type: 'cancel', id: 'r1' }, rngMid);
    expect(s3).not.toBe(s2);

    const s4 = rfqReducer(s3, { type: 'clear' }, rngMid);
    expect(s4).not.toBe(s3);
  });

  it('original request objects are not mutated by tick', () => {
    const s0 = rfqReducer([], { type: 'send', req: sendPayload() }, rngMid);
    const req0 = s0[0];
    rfqReducer(s0, { type: 'tick' }, rngMid);
    expect(s0[0]).toBe(req0); // same reference — not mutated
    expect(req0.ticks).toBe(0); // original unchanged
  });
});
