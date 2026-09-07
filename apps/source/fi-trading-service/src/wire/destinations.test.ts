import { describe, expect, it } from 'vitest';

import {
  DATASETS,
  keyColumnFor,
  parseAsOfDateSegment,
  parseSubscribeDestination,
  parseTriggerDestination,
  subscribeDestination,
  triggerMatchesSubscription,
} from './destinations.js';

describe('parseAsOfDateSegment', () => {
  it('accepts both dashed and bare forms', () => {
    expect(parseAsOfDateSegment('2026-03-15')).toBe('2026-03-15');
    expect(parseAsOfDateSegment('20260315')).toBe('2026-03-15');
  });

  it('rejects impossible calendar dates', () => {
    expect(parseAsOfDateSegment('2026-02-30')).toBeNull();
    expect(parseAsOfDateSegment('20260230')).toBeNull();
    expect(parseAsOfDateSegment('99999999')).toBeNull();
  });

  it('rejects anything that is not a date shape', () => {
    expect(parseAsOfDateSegment('1000')).toBeNull();
    expect(parseAsOfDateSegment('abc')).toBeNull();
  });
});

describe('subscribe destinations', () => {
  it('parses the live topic for every dataset', () => {
    for (const dataset of DATASETS) {
      const parsed = parseSubscribeDestination(`/snapshot/${dataset}/trd1`);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.value.dataset).toBe(dataset);
        expect(parsed.value.clientId).toBe('trd1');
        expect(parsed.value.asOfDate).toBeNull();
      }
    }
  });

  it('parses the historical positions topic', () => {
    const parsed = parseSubscribeDestination('/snapshot/positions/trd1/2026-03-15');
    expect(parsed.ok && parsed.value.asOfDate).toBe('2026-03-15');
  });

  it('rejects a historical topic with an invalid date', () => {
    const parsed = parseSubscribeDestination('/snapshot/positions/trd1/nope');
    expect(parsed.ok).toBe(false);
  });

  it('rejects a four-segment topic on a non-positions dataset', () => {
    expect(parseSubscribeDestination('/snapshot/trades/trd1/2026-03-15').ok).toBe(false);
  });

  it('rejects unknown datasets, missing clientId and bad prefixes', () => {
    expect(parseSubscribeDestination('/snapshot/nope/trd1').ok).toBe(false);
    expect(parseSubscribeDestination('/snapshot/positions/').ok).toBe(false);
    expect(parseSubscribeDestination('/other/positions/trd1').ok).toBe(false);
    expect(parseSubscribeDestination('positions/trd1').ok).toBe(false);
  });
});

describe('trigger destinations', () => {
  it('parses rate and optional batch size', () => {
    const withBatch = parseTriggerDestination('/snapshot/positions/trd1/1000/250');
    expect(withBatch.ok && withBatch.value).toMatchObject({ rate: 1000, batchSize: 250 });
    const noBatch = parseTriggerDestination('/snapshot/trades/trd1/500');
    expect(noBatch.ok && noBatch.value).toMatchObject({ rate: 500, batchSize: 500 });
  });

  it('treats a valid 8-digit positions segment as a DATE, matching the client', () => {
    const parsed = parseTriggerDestination('/snapshot/positions/trd1/20260315');
    expect(parsed.ok && parsed.value.asOfDate).toBe('2026-03-15');
    expect(parsed.ok && parsed.value.rate).toBe(0);
  });

  it('rejects an out-of-range rate rather than reinterpreting it', () => {
    const parsed = parseTriggerDestination('/snapshot/trades/trd1/20260315');
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/YYYYMMDD/);
  });

  it('accepts a batch size on the historical path', () => {
    const parsed = parseTriggerDestination('/snapshot/positions/trd1/2026-03-15/100');
    expect(parsed.ok && parsed.value).toMatchObject({ asOfDate: '2026-03-15', batchSize: 100 });
  });

  it('accepts rate 0 as snapshot-only', () => {
    const parsed = parseTriggerDestination('/snapshot/orders/trd1/0');
    expect(parsed.ok && parsed.value.rate).toBe(0);
  });

  it('rejects malformed rates, batch sizes and arities', () => {
    expect(parseTriggerDestination('/snapshot/trades/trd1/abc').ok).toBe(false);
    expect(parseTriggerDestination('/snapshot/trades/trd1/100/abc').ok).toBe(false);
    expect(parseTriggerDestination('/snapshot/trades/trd1/100/0').ok).toBe(false);
    expect(parseTriggerDestination('/snapshot/trades/trd1').ok).toBe(false);
    expect(parseTriggerDestination('/snapshot/trades/trd1/1/2/3').ok).toBe(false);
    expect(parseTriggerDestination('/snapshot/nope/trd1/100').ok).toBe(false);
  });
});

describe('helpers', () => {
  it('formats subscribe destinations back', () => {
    expect(subscribeDestination({ dataset: 'trades', clientId: 'x', asOfDate: null })).toBe(
      '/snapshot/trades/x',
    );
    expect(
      subscribeDestination({ dataset: 'positions', clientId: 'x', asOfDate: '2026-03-15' }),
    ).toBe('/snapshot/positions/x/2026-03-15');
  });

  it('matches a trigger to its subscription on all three axes', () => {
    const sub = { dataset: 'positions', clientId: 'a', asOfDate: null } as const;
    const base = { rate: 1, batchSize: 500 };
    expect(triggerMatchesSubscription({ ...sub, ...base }, sub)).toBe(true);
    expect(triggerMatchesSubscription({ ...sub, ...base, clientId: 'b' }, sub)).toBe(false);
    expect(triggerMatchesSubscription({ ...sub, ...base, dataset: 'trades' }, sub)).toBe(false);
    expect(triggerMatchesSubscription({ ...sub, ...base, asOfDate: '2026-03-15' }, sub)).toBe(false);
  });

  it('gives every dataset a distinct key column', () => {
    const keys = DATASETS.map(keyColumnFor);
    expect(new Set(keys).size).toBe(DATASETS.length);
  });
});
