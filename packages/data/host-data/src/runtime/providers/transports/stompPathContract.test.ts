import { describe, it, expect } from 'vitest';
import {
  classifyStompListenerTopic,
  parseAsOfDateSegment,
  validateStompPathContract,
} from './stompPathContract';

describe('parseAsOfDateSegment', () => {
  it('accepts ISO and compact dates', () => {
    expect(parseAsOfDateSegment('2026-05-28')).toBeTruthy();
    expect(parseAsOfDateSegment('20260528')).toBeTruthy();
    expect(parseAsOfDateSegment('2026-13-01')).toBeNull();
  });
});

describe('classifyStompListenerTopic', () => {
  it('detects live vs historical topics', () => {
    expect(classifyStompListenerTopic('/snapshot/positions/TRADER001')).toBe('live');
    expect(classifyStompListenerTopic('/snapshot/positions/TRADER001/2026-05-28')).toBe('historical');
  });
});

describe('validateStompPathContract', () => {
  it('accepts matching historical listener and trigger', () => {
    expect(
      validateStompPathContract(
        '/snapshot/positions/TRADER001/2026-05-28',
        '/snapshot/positions/TRADER001/2026-05-28/50',
      ),
    ).toBeNull();
  });

  it('rejects live-style rate/batch trigger after historical listener', () => {
    expect(
      validateStompPathContract(
        '/snapshot/positions/TRADER001/2026-05-28',
        '/snapshot/positions/TRADER001/2026-05-28/1000/50',
      ),
    ).toMatch(/live rate\/batch path/);
  });

  it('accepts live listener and client-specific trigger', () => {
    expect(
      validateStompPathContract(
        '/snapshot/positions/TRADER001',
        '/snapshot/positions/TRADER001/1000/50',
      ),
    ).toBeNull();
  });
});
