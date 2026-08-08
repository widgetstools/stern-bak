import { describe, expect, it } from 'vitest';
import { getScenarioById, scenariosForTab } from './scenarios';
import type { LabRow } from '../data/types';

const sampleRows: LabRow[] = Array.from({ length: 10 }, (_, i) => ({
  id: String(i + 1),
  bidPrice: 100 + i * 0.1,
  midPrice: 100.5 + i * 0.1,
  askPrice: 101 + i * 0.1,
  dailyPnL: i % 2 === 0 ? 1000 : -500,
  compositeRating: 'A',
  yieldToWorst: 5,
  yieldToMaturity: 4.5,
  oas: 120,
  marketValue: 1_000_000,
  quantityFace: 1_000_000,
  issuerSector: 'Financials',
})) as LabRow[];

const TAB_IDS = [
  'overview', 'formatting', 'visual-excel', 'renderers', 'toolbar', 'groups',
  'calc', 'conditional', 'filters', 'live', 'alerts', 'editing', 'bulk-update',
  'plus-minus', 'shortcuts', 'profiles',
];

describe('scenarios', () => {
  it('returns scenarios for a tab and empty list for unknown tabs', () => {
    expect(scenariosForTab('overview').length).toBeGreaterThan(0);
    expect(scenariosForTab('unknown-tab')).toEqual([]);
  });

  it('finds scenarios by id', () => {
    expect(getScenarioById('bid-spike')?.title).toMatch(/Bid spike/i);
    expect(getScenarioById('missing-id')).toBeUndefined();
  });

  it('applies every registered scenario without throwing', () => {
    const seen = new Set<string>();
    for (const tabId of TAB_IDS) {
      for (const scenario of scenariosForTab(tabId)) {
        if (seen.has(scenario.id)) continue;
        seen.add(scenario.id);
        const result = scenario.apply(sampleRows);
        expect(result.length).toBe(sampleRows.length);
        expect(result[0]).toBeDefined();
      }
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('covers representative scenario transforms', () => {
    expect(Number(getScenarioById('bid-spike')!.apply(sampleRows)[0].bidPrice)).toBe(112.5);
    expect(Number(getScenarioById('pnl-loss')!.apply(sampleRows)[0].dailyPnL)).toBe(-42_500);
    expect(getScenarioById('multi-loser-strip')!.apply(sampleRows)[4].dailyPnL).toBeLessThan(0);
    expect(getScenarioById('heatmap-oas')!.apply(sampleRows)[7].oas).toBeGreaterThan(400);
    expect(getScenarioById('pricing-ladder')!.apply(sampleRows)[2].ticker).toBe('LADDER-3');
    expect(getScenarioById('krd-curve')!.apply(sampleRows)[0].krd30Y).toBe(6.5);
    expect(getScenarioById('editing-multi-column')!.apply(sampleRows)[1].midPrice).toBe(101.25);
  });

  it('handles empty input rows', () => {
    for (const scenario of scenariosForTab('overview')) {
      expect(scenario.apply([])).toEqual([]);
    }
  });
});
