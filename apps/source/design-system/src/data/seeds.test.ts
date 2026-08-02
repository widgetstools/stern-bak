import { describe, expect, it } from 'vitest';
import {
  BOOK_RISK,
  CURVE_SERIES,
  DEALERS,
  MARKET_INDICES,
  RATE_SCENARIOS,
  RESEARCH_NOTES,
  SEED_INSTRUMENTS,
  makeRng,
  seedState,
} from './seeds';

describe('seeds', () => {
  it('makeRng is deterministic for the same seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it('exports static seed data with expected shapes', () => {
    expect(SEED_INSTRUMENTS.length).toBeGreaterThan(10);
    expect(DEALERS).toContain('GS');
    expect(CURVE_SERIES[0]).toHaveProperty('tenor');
    expect(RATE_SCENARIOS.some((s) => s.label === 'flat')).toBe(true);
    expect(BOOK_RISK.length).toBeGreaterThan(0);
    expect(MARKET_INDICES.length).toBeGreaterThan(0);
    expect(RESEARCH_NOTES[0]).toHaveProperty('title');
  });

  it('seedState builds a coherent terminal state', () => {
    const state = seedState(Date.now());
    expect(state.instruments.length).toBe(SEED_INSTRUMENTS.length);
    expect(Object.keys(state.quotes).length).toBe(state.instruments.length);
    expect(state.orders.length).toBeGreaterThan(0);
    expect(state.positions.length).toBeGreaterThan(0);
    expect(state.curve.length).toBeGreaterThan(0);
    for (const inst of state.instruments) {
      const q = state.quotes[inst.id];
      expect(q.bid).toBeLessThanOrEqual(q.mid);
      expect(q.mid).toBeLessThanOrEqual(q.ask);
    }
  });
});
