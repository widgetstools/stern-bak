import { describe, expect, it } from 'vitest';
import {
  parseAsOfDateTrigger,
  TRIGGER_CLIENT_SPECIFIC,
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

  it('rejects live rate/batch suffix after as-of date (common misconfiguration)', () => {
    expect(parseAsOfDateTrigger('/snapshot/positions/TRADER001/2026-05-28/1000/10')).toBeNull();
    expect(parseAsOfDateTrigger('/snapshot/positions/TRADER001/{asofdate}/1000/10')).toBeNull();
  });

  it('parses live client-specific trigger separately', () => {
    const match = '/snapshot/positions/TRADER001/1000/10'.match(TRIGGER_CLIENT_SPECIFIC);
    expect(match?.slice(1)).toEqual(['positions', 'TRADER001', '1000', '10']);
  });
});
