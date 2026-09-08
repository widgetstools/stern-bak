import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScenarioTools, SCENARIO_CELL, type ScenarioCellPayload } from './scenarioTools';
import * as client from './scenarioClient';
import { ScenarioServiceError } from './scenarioClient';

const tools = createScenarioTools({ baseUrl: () => 'http://svc.test:8081' });

afterEach(() => {
  vi.restoreAllMocks();
});

const WORST_WORLD = {
  worldIndex: 48, terminalPnl: -1.55e9, worstPnl: -1.64e9, worstOnDay: 9,
  downgrades: 3, creditJumps: 6, tenYearFrom: 5.16, tenYearTo: 6.04,
  creditFrom: -0.16, creditTo: 0.25,
  byBucket: [
    { bucket: 'CorpHY', pnl: -4.7e8, share: 0.31 },
    { bucket: 'CorpIG', pnl: -4.3e8, share: 0.28 },
  ],
  worstPositions: [
    { positionId: 'P1', description: 'RITE AID 12.875% 2035', bucket: 'CorpHY', pnl: -2.07e7 },
  ],
};

const SCAN = {
  bookFingerprint: 'bk-abc', positionCount: 1758, baseMarketValue: 2.28e10,
  worlds: 250, horizonDays: 20, terminalPnl: [1, 2, 3], mean: -2.8e7, median: -2.2e7,
  var95: -7.79e8, cvar95: -1.02e9, best: 1.4e9, worst: -1.53e9,
  worstWorlds: [WORST_WORLD], plausibility: '250 worlds drawn from the model',
  elapsedMs: 236, revaluation: 'fast-path', distribution: [{ from: -1e9, to: 0, count: 250 }],
};

function payloadOf(result: { data?: unknown }): ScenarioCellPayload {
  return result.data as ScenarioCellPayload;
}

describe('describeBook', () => {
  it('summarises in millions and names the largest asset classes', async () => {
    vi.spyOn(client, 'fetchBookSummary').mockResolvedValue({
      fingerprint: 'bk-abc', asOf: 20260907, positionCount: 1758, marketValue: 2.28e10,
      byAssetClass: [
        { assetClass: 'CorpIG', positions: 482, marketValue: 6.14e9 },
        { assetClass: 'Muni', positions: 420, marketValue: 5.8e9 },
      ],
    });
    const result = await tools.describeBook();
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('1758 positions');
    expect(result.summary).toContain('$22800.0mm');
    expect(result.summary).toContain('CorpIG');
  });

  it('reports an unreachable service as a repairable failure, not a throw', async () => {
    vi.spyOn(client, 'fetchBookSummary').mockRejectedValue(
      new ScenarioServiceError('The service at X is not reachable. Start it with npm run dev', 'X'),
    );
    const result = await tools.describeBook();
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('not reachable');
    expect(result.summary).toContain('npm run dev');
  });
});

describe('runScenarios', () => {
  it('returns a scenario cell with the whole scan attached', async () => {
    vi.spyOn(client, 'runScan').mockResolvedValue(SCAN);
    const result = await tools.runScenarios({ worlds: 250, horizonDays: 20 });
    const payload = payloadOf(result);
    expect(payload.kind).toBe(SCENARIO_CELL);
    expect(payload.view).toBe('scan');
    expect(payload.scan).toBe(SCAN);
    expect(payload.bookFingerprint).toBe('bk-abc');
    expect(payload.elapsedMs).toBe(236);
  });

  it('quotes the tail, not just the mean', async () => {
    vi.spyOn(client, 'runScan').mockResolvedValue(SCAN);
    const result = await tools.runScenarios({});
    expect(result.summary).toContain('5th percentile');
    expect(result.summary).toContain('expected shortfall');
    expect(result.summary).toContain('worst');
  });

  it('tells the model these are re-simulated histories, not bumps', async () => {
    vi.spyOn(client, 'runScan').mockResolvedValue(SCAN);
    const result = await tools.runScenarios({});
    expect(result.summary).toMatch(/re-simulated histories, not bumps/);
  });

  it('explains the worst world with its factor path and attribution', async () => {
    vi.spyOn(client, 'runScan').mockResolvedValue(SCAN);
    const result = await tools.runScenarios({});
    expect(result.summary).toContain('5.16%');
    expect(result.summary).toContain('6.04%');
    expect(result.summary).toContain('3 downgrades');
    expect(result.summary).toContain('CorpHY');
  });

  it('passes only the arguments it was given, leaving the service its defaults', async () => {
    const spy = vi.spyOn(client, 'runScan').mockResolvedValue(SCAN);
    await tools.runScenarios({ horizonDays: 63 });
    expect(spy).toHaveBeenCalledWith('http://svc.test:8081', { horizonDays: 63 });
  });

  it('forwards a shock untouched', async () => {
    const spy = vi.spyOn(client, 'runScan').mockResolvedValue(SCAN);
    await tools.runScenarios({ shock: { level: 0.5, credit: 0.2, onDay: 3 } });
    expect(spy).toHaveBeenCalledWith('http://svc.test:8081', {
      shock: { level: 0.5, credit: 0.2, onDay: 3 },
    });
  });

  it('survives a scan that reported no worst worlds', async () => {
    vi.spyOn(client, 'runScan').mockResolvedValue({ ...SCAN, worstWorlds: [] });
    const result = await tools.runScenarios({});
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('median');
  });
});

describe('findWorstCase', () => {
  const WORST = {
    bookFingerprint: 'bk-abc', horizonDays: 20, radius: 2.5,
    move: { level: 0.42, slope: 0.22, curvature: 0.19, hump: 0.1, credit: 0.16 },
    predictedPnl: -9.67e8, actualPnl: -9.49e8, convexityEffect: 1.7e7,
    tenYearMoveBp: 42, creditWideningPct: 17.5,
    exposure: { gradient: [], standaloneLoss: [], labels: ['level', 'credit'] },
    byBucket: [{ bucket: 'CorpIG', pnl: -2.6e8, share: 0.28 }],
    worstPositions: [{ positionId: 'P1', description: 'RITE AID', bucket: 'CorpHY', pnl: -1e7 }],
    explanation: 'This book is concentrated in CorpIG.',
    plausibility: 'the 2.5-standard-deviation boundary',
  };

  it('states the move in the units a desk speaks and what it cost', async () => {
    vi.spyOn(client, 'findWorstMove').mockResolvedValue(WORST);
    const result = await tools.findWorstCase({ horizonDays: 20 });
    expect(result.summary).toContain('+42bp');
    expect(result.summary).toContain('widening 18%');
    expect(result.summary).toContain('-$949.0mm');
    expect(payloadOf(result).view).toBe('worst-move');
  });

  it('carries the explanation and the convexity gap through to the summary', async () => {
    vi.spyOn(client, 'findWorstMove').mockResolvedValue(WORST);
    const result = await tools.findWorstCase({});
    expect(result.summary).toContain('concentrated in CorpIG');
    expect(result.summary).toContain('Convexity moved it');
  });

  it('says when credit tightens rather than widens', async () => {
    vi.spyOn(client, 'findWorstMove').mockResolvedValue({ ...WORST, creditWideningPct: -8 });
    const result = await tools.findWorstCase({});
    expect(result.summary).toContain('tightening 8%');
  });
});

describe('forkMarket', () => {
  const FORK = {
    name: 'CPI 30bp hotter', bookFingerprint: 'bk-abc',
    actual: { median: -1.53e7, worst: -1e8, worstWorlds: [] },
    counterfactual: { median: -5.6e8, worst: -8e8, worstWorlds: [WORST_WORLD] },
    difference: { median: -5.45e8, worst: -7e8 },
    plausibility: 'one world, replayed twice',
  };

  it('reports the difference as the shock and nothing else', async () => {
    vi.spyOn(client, 'forkMarket').mockResolvedValue(FORK);
    const result = await tools.forkMarket({ name: 'CPI 30bp hotter', shock: { level: 0.3 } });
    expect(result.summary).toContain('CPI 30bp hotter');
    expect(result.summary).toContain('-$545.0mm');
    expect(result.summary).toMatch(/held identical, so the difference is the shock and nothing else/);
    expect(payloadOf(result).view).toBe('fork');
  });

  it('requires and forwards the shock', async () => {
    const spy = vi.spyOn(client, 'forkMarket').mockResolvedValue(FORK);
    await tools.forkMarket({ shock: { credit: 0.25 }, horizonDays: 10 });
    expect(spy).toHaveBeenCalledWith('http://svc.test:8081', {
      horizonDays: 10, shock: { credit: 0.25 },
    });
  });

  it('turns an unexpected failure into a readable summary', async () => {
    vi.spyOn(client, 'forkMarket').mockRejectedValue(new Error('kaboom'));
    const result = await tools.forkMarket({ shock: { level: 1 } });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('kaboom');
  });
});

describe('solveStrategy', () => {
  const SOLVE = {
    name: 'Halve duration, hold credit', bookFingerprint: 'bk-abc', candidateCount: 138,
    narrative: 'Every target was met to within 5%.',
    package: {
      packageId: 'PKG-01', name: 'Halve duration, hold credit', status: 'proposed' as const,
      grossNotionalUsd: 6.2e9, totalExecutionCost: 1.6e6, carryChangeUsd: -3e8,
      tickets: [{
        ticketId: 'T1', securityId: 1, description: 'US TREASURY NOTE 4.750% 2036',
        side: 'SELL' as const, notionalUsd: 1.11e9, executionCost: 2e5, carryUsd: -5e7,
        kind: 'Treasury' as const, cusip: 'X', quotedPrice: '99-16+', decimalPrice: 99.5,
        maturityDate: 20360907,
      }],
    },
    exposureBefore: { level: -1.3e9, slope: 0, curvature: 0, hump: 0, credit: -1.1e9 },
    exposureAfter: { level: -6.6e8, slope: 0, curvature: 0, hump: 0, credit: -1.1e9 },
    coverage: { level: 0.98, slope: null, curvature: null, hump: null, credit: 1 },
    residual: { level: 0, slope: null, curvature: null, hump: null, credit: 0 },
    verification: {
      worlds: 200, horizonDays: 20,
      before: { worst: -1.27e9, var95: -7.8e8, cvar95: -9.99e8, median: -1.5e7, best: 1.47e9 },
      after: { worst: -8.67e8, var95: -5.4e8, cvar95: -6.27e8, median: 1e7, best: 7.85e8 },
      worstCaseBefore: -9.5e8, worstCaseAfter: -5.9e8,
      distributionBefore: [], distributionAfter: [],
    },
    plausibility: '200 worlds',
  };

  it('leads with the verification, because that is the claim', async () => {
    vi.spyOn(client, 'solveStrategy').mockResolvedValue(SOLVE);
    const result = await tools.solveStrategy({ target: { level: -6.5e8, credit: 'hold' } });
    expect(result.summary).toContain('Verified on the same 200 worlds');
    expect(result.summary).toContain('-$1270.0mm');
    expect(result.summary).toContain('-$867.0mm');
    expect(payloadOf(result).view).toBe('package');
  });

  it('says the package is proposed and nothing was traded', async () => {
    vi.spyOn(client, 'solveStrategy').mockResolvedValue(SOLVE);
    const result = await tools.solveStrategy({ target: { level: 0 } });
    expect(result.summary).toContain('proposed, not staged');
    expect(result.summary).toContain('nothing has been traded');
  });

  it('carries the solver\'s own narrative through, residual and all', async () => {
    vi.spyOn(client, 'solveStrategy').mockResolvedValue({
      ...SOLVE, narrative: 'Short on credit (19% covered) — the tradeable universe cannot fully express that exposure.',
    });
    const result = await tools.solveStrategy({ target: { credit: 0 } });
    expect(result.summary).toContain('19% covered');
    expect(result.summary).toContain('cannot fully express');
  });

  /**
   * The case a modelled hedge would hide. If the tail improved but the worst
   * world got worse, the package does not address what drives this book's worst
   * case, and the model has to be told so explicitly or it will report success.
   */
  it('calls out a hedge that improved the tail but worsened the worst world', async () => {
    vi.spyOn(client, 'solveStrategy').mockResolvedValue({
      ...SOLVE,
      verification: {
        ...SOLVE.verification,
        after: { ...SOLVE.verification.after, worst: -1.32e9, cvar95: -9.2e8 },
      },
    });
    const result = await tools.solveStrategy({ target: { credit: 0 } });
    expect(result.summary).toContain('WORST world got worse');
    expect(result.summary).toContain('does not help against what actually drives');
  });

  it('does not cry wolf when the worst world improved', async () => {
    vi.spyOn(client, 'solveStrategy').mockResolvedValue(SOLVE);
    const result = await tools.solveStrategy({ target: { level: 0 } });
    expect(result.summary).not.toContain('WORST world got worse');
  });

  it('lists the legs it would trade', async () => {
    vi.spyOn(client, 'solveStrategy').mockResolvedValue(SOLVE);
    const result = await tools.solveStrategy({ target: { level: 0 } });
    expect(result.summary).toContain('SELL 1110mm US TREASURY NOTE 4.750% 2036');
  });

  it('forwards the target untouched, including "hold"', async () => {
    const spy = vi.spyOn(client, 'solveStrategy').mockResolvedValue(SOLVE);
    await tools.solveStrategy({ target: { level: 0, credit: 'hold' }, worlds: 50 });
    expect(spy).toHaveBeenCalledWith('http://svc.test:8081', {
      target: { level: 0, credit: 'hold' }, worlds: 50,
    });
  });

  it('reports an unreachable service rather than throwing', async () => {
    vi.spyOn(client, 'solveStrategy').mockRejectedValue(
      new ScenarioServiceError('not reachable', 'http://svc.test:8081'),
    );
    const result = await tools.solveStrategy({ target: { level: 0 } });
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('not reachable');
  });
});
