import { describe, expect, it } from 'vitest';
import { buildScenarioEditBatch } from './ssrmScenarioEdits';

describe('buildScenarioEditBatch', () => {
  const rows = [
    { id: 'a', bidPrice: 100, dailyPnL: 5 },
    { id: 'b', bidPrice: 101, dailyPnL: 6 },
  ];

  it('sends only changed rows, whole, with their changed columns named', () => {
    const batch = buildScenarioEditBatch(
      { apply: (r) => r.map((row) => (row.id === 'a' ? { ...row, dailyPnL: -42_500 } : { ...row })) },
      rows,
    );
    expect(batch.rows).toEqual([{ id: 'a', bidPrice: 100, dailyPnL: -42_500 }]);
    expect(batch.editedColumns).toEqual([['dailyPnL']]);
  });

  it('returns an empty batch when the scenario changes nothing', () => {
    const batch = buildScenarioEditBatch({ apply: (r) => r.map((row) => ({ ...row })) }, rows);
    expect(batch.rows).toEqual([]);
    expect(batch.editedColumns).toEqual([]);
  });
});
