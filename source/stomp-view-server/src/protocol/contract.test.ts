import { describe, expect, it } from 'vitest';
import {
  asOfDateSnapshotCompleteText,
  asOfDateSubscriptionDestination,
  clientSnapshotCompleteText,
  clientSubscriptionDestination,
  connectedHeaders,
  defaultBatchSize,
  genericSubscriptionDestination,
  legacySnapshotCompleteText,
  parseAsOfDateSegment,
  parseAsOfDateTrigger,
  SERVER_NAME,
  STOMP_VERSION,
  TRIGGER_CLIENT_SPECIFIC,
  TRIGGER_LEGACY,
} from './contract.js';

describe('stomp-view-server trigger contract', () => {
  it('parses historical positions trigger with optional batch size', () => {
    const parsed = parseAsOfDateTrigger('/snapshot/positions/TRADER001/2026-05-28/50');
    expect(parsed).toEqual({
      clientId: 'TRADER001',
      asOfDateIso: '2026-05-28T00:00:00.000Z',
      asOfDateDisplay: '2026-05-28',
      batchSize: 50,
    });
  });

  it('uses default batch size when omitted on as-of trigger', () => {
    const parsed = parseAsOfDateTrigger('/snapshot/positions/TRADER001/20260528');
    expect(parsed?.batchSize).toBe(50);
    expect(parsed?.asOfDateIso).toBe('2026-05-28T00:00:00.000Z');
  });

  it('rejects live rate/batch suffix after as-of date (common misconfiguration)', () => {
    expect(parseAsOfDateTrigger('/snapshot/positions/TRADER001/2026-05-28/1000/10')).toBeNull();
    expect(parseAsOfDateTrigger('/snapshot/positions/TRADER001/{asofdate}/1000/10')).toBeNull();
  });

  it('parses live client-specific trigger separately', () => {
    const match = '/snapshot/positions/TRADER001/1000/10'.match(TRIGGER_CLIENT_SPECIFIC);
    expect(match?.slice(1)).toEqual(['positions', 'TRADER001', '1000', '10']);
  });

  it('parses legacy trigger pattern', () => {
    const match = '/snapshot/trades/500/100'.match(TRIGGER_LEGACY);
    expect(match?.slice(1)).toEqual(['trades', '500', '100']);
  });
});

describe('parseAsOfDateSegment', () => {
  it('accepts ISO YYYY-MM-DD dates', () => {
    expect(parseAsOfDateSegment('2026-05-28')).toBe('2026-05-28T00:00:00.000Z');
  });

  it('accepts compact YYYYMMDD dates', () => {
    expect(parseAsOfDateSegment('20260528')).toBe('2026-05-28T00:00:00.000Z');
  });

  it('rejects invalid calendar dates', () => {
    expect(parseAsOfDateSegment('2026-02-30')).toBeNull();
    expect(parseAsOfDateSegment('20260230')).toBeNull();
    expect(parseAsOfDateSegment('not-a-date')).toBeNull();
  });
});

describe('contract helpers', () => {
  it('builds connected headers', () => {
    expect(connectedHeaders('sess-1')).toEqual({
      version: STOMP_VERSION,
      session: 'sess-1',
      server: SERVER_NAME,
      'heart-beat': '0,0',
    });
  });

  it('builds subscription destinations', () => {
    expect(genericSubscriptionDestination('positions')).toBe('/snapshot/positions');
    expect(clientSubscriptionDestination('trades', 'C1')).toBe('/snapshot/trades/C1');
    expect(asOfDateSubscriptionDestination('C1', '2026-05-28')).toBe(
      '/snapshot/positions/C1/2026-05-28',
    );
  });

  it('computes default batch size from rate', () => {
    expect(defaultBatchSize(50)).toBe(100);
    expect(defaultBatchSize(5000)).toBe(500);
    expect(defaultBatchSize(50000)).toBe(2000);
  });

  it('formats snapshot complete messages', () => {
    expect(legacySnapshotCompleteText(100, 'positions')).toContain('100');
    expect(clientSnapshotCompleteText(50, 'trades', 'T1')).toContain('T1');
    expect(asOfDateSnapshotCompleteText(10, '2026-05-28', 'T1')).toContain('2026-05-28');
  });
});
