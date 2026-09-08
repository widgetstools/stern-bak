import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScenarioResultCell } from './ScenarioResultCell';
import { SCENARIO_CELL, type ScenarioCellPayload } from '../scenarioTools';
import type { SolveResponse } from '../scenarioClient';

const WORLD = {
  worldIndex: 48, terminalPnl: -1.55e9, worstPnl: -1.64e9, worstOnDay: 9,
  downgrades: 3, creditJumps: 6, tenYearFrom: 5.16, tenYearTo: 6.04,
  creditFrom: -0.16, creditTo: 0.25,
  byBucket: [
    { bucket: 'CorpHY', pnl: -4.7e8, share: 0.31 },
    { bucket: 'CorpIG', pnl: -4.3e8, share: 0.28 },
    { bucket: 'Rates', pnl: 1.2e7, share: -0.01 },
  ],
  worstPositions: [{ positionId: 'P1', description: 'RITE AID 12.875% 2035', bucket: 'CorpHY', pnl: -2.07e7 }],
};

function scanPayload(over: Partial<ScenarioCellPayload> = {}): ScenarioCellPayload {
  return {
    kind: SCENARIO_CELL, view: 'scan', bookFingerprint: 'bk-abc', positionCount: 1758,
    baseMarketValue: 2.28e10, headline: '250 forked worlds over 20 business days',
    plausibility: '250 worlds drawn from the model\'s own dynamics', elapsedMs: 236,
    scan: {
      bookFingerprint: 'bk-abc', positionCount: 1758, baseMarketValue: 2.28e10,
      worlds: 250, horizonDays: 20, terminalPnl: [], mean: -2.8e7, median: -2.2e7,
      var95: -7.79e8, cvar95: -1.02e9, best: 1.43e9, worst: -1.53e9,
      worstWorlds: [WORLD], plausibility: 'x', elapsedMs: 236, revaluation: 'fast-path',
      distribution: [
        { from: -1.5e9, to: -1e9, count: 12 },
        { from: -1e9, to: -5e8, count: 60 },
        { from: -5e8, to: 0, count: 120 },
        { from: 0, to: 5e8, count: 58 },
      ],
    },
    ...over,
  };
}

describe('scan view', () => {
  it('leads with the distribution statistics a desk quotes', () => {
    render(<ScenarioResultCell payload={scanPayload()} />);
    expect(screen.getByText('Forked worlds')).toBeInTheDocument();
    expect(screen.getByText('−$22.0mm')).toBeInTheDocument();
    expect(screen.getByText('−$779.0mm')).toBeInTheDocument();
    expect(screen.getByText('−$1020.0mm')).toBeInTheDocument();
    expect(screen.getByText('+$1430.0mm')).toBeInTheDocument();
  });

  it('draws one bar per histogram bin, labelled for a reader', () => {
    render(<ScenarioResultCell payload={scanPayload()} />);
    const chart = screen.getByRole('img', { name: /distribution of outcomes/i });
    expect(chart.children).toHaveLength(4);
    expect(chart.querySelector('[title*="12 worlds"]')).not.toBeNull();
  });

  it('explains the worst world with its factor path', () => {
    render(<ScenarioResultCell payload={scanPayload()} />);
    expect(screen.getByText(/5\.16% → 6\.04%/)).toBeInTheDocument();
    expect(screen.getByText(/3 downgrades/)).toBeInTheDocument();
    expect(screen.getByText(/6 spread jumps/)).toBeInTheDocument();
  });

  it('attributes by asset class and names the hardest hit positions', () => {
    render(<ScenarioResultCell payload={scanPayload()} />);
    expect(screen.getByText('CorpHY')).toBeInTheDocument();
    expect(screen.getByText('−$470.0mm')).toBeInTheDocument();
    expect(screen.getByText('RITE AID 12.875% 2035')).toBeInTheDocument();
  });

  it('always states the plausibility bound and the book it ran against', () => {
    render(<ScenarioResultCell payload={scanPayload()} />);
    expect(screen.getByText(/own dynamics · book bk-abc/)).toBeInTheDocument();
  });

  it('renders a scan with no worst world rather than crashing', () => {
    const payload = scanPayload();
    render(<ScenarioResultCell payload={{ ...payload, scan: { ...payload.scan!, worstWorlds: [] } }} />);
    expect(screen.getByText('Forked worlds')).toBeInTheDocument();
  });

  it('renders an empty distribution rather than an empty chart frame', () => {
    const payload = scanPayload();
    render(<ScenarioResultCell payload={{ ...payload, scan: { ...payload.scan!, distribution: [] } }} />);
    expect(screen.queryByRole('img', { name: /distribution/i })).toBeNull();
  });
});

describe('worst-move view', () => {
  const payload: ScenarioCellPayload = {
    kind: SCENARIO_CELL, view: 'worst-move', bookFingerprint: 'bk-abc', positionCount: 0,
    baseMarketValue: 0, headline: 'Worst plausible move', plausibility: 'the 2.5-sd boundary',
    worstMove: {
      bookFingerprint: 'bk-abc', horizonDays: 20, radius: 2.5,
      move: { level: 0.42, slope: 0.22, curvature: 0.19, hump: 0.1, credit: 0.16 },
      predictedPnl: -9.67e8, actualPnl: -9.49e8, convexityEffect: 1.7e7,
      tenYearMoveBp: 42, creditWideningPct: 17.5,
      exposure: { gradient: [], standaloneLoss: [], labels: [] },
      byBucket: [{ bucket: 'CorpIG', pnl: -2.6e8, share: 0.28 }],
      worstPositions: [{ positionId: 'P1', description: 'RITE AID', bucket: 'CorpHY', pnl: -1e7 }],
      explanation: 'This book is concentrated in CorpIG.',
      plausibility: 'the 2.5-sd boundary',
    },
  };

  it('shows the move in the factors\' own units, and the convexity separately', () => {
    render(<ScenarioResultCell payload={payload} />);
    expect(screen.getByText('+42bp')).toBeInTheDocument();
    expect(screen.getByText('+18%')).toBeInTheDocument();
    expect(screen.getByText('−$949.0mm')).toBeInTheDocument();
    expect(screen.getByText('+$17.0mm')).toBeInTheDocument();
  });

  it('gives the explanation its own line, because it is the answer', () => {
    render(<ScenarioResultCell payload={payload} />);
    expect(screen.getByText('This book is concentrated in CorpIG.')).toBeInTheDocument();
  });
});

describe('fork view', () => {
  const payload: ScenarioCellPayload = {
    kind: SCENARIO_CELL, view: 'fork', bookFingerprint: 'bk-abc', positionCount: 0,
    baseMarketValue: 0, headline: 'CPI 30bp hotter', plausibility: 'one world replayed twice',
    fork: {
      name: 'CPI 30bp hotter', bookFingerprint: 'bk-abc',
      actual: { median: -1.53e7, worst: -1e8, worstWorlds: [] },
      counterfactual: { median: -5.6e8, worst: -8e8, worstWorlds: [WORLD] },
      difference: { median: -5.45e8, worst: -7e8 },
      plausibility: 'one world replayed twice',
    },
  };

  it('names the counterfactual and puts the two histories side by side', () => {
    render(<ScenarioResultCell payload={payload} />);
    expect(screen.getByText(/Counterfactual — CPI 30bp hotter/)).toBeInTheDocument();
    expect(screen.getByText('−$15.3mm')).toBeInTheDocument();
    expect(screen.getByText('−$560.0mm')).toBeInTheDocument();
    expect(screen.getByText('−$545.0mm')).toBeInTheDocument();
  });
});

describe('package view', () => {
  const solve: SolveResponse = {
    name: 'Halve duration, hold credit', bookFingerprint: 'bk-abc', candidateCount: 138,
    narrative: 'Every target was met to within 5%.',
    package: {
      packageId: 'PKG-01', name: 'Halve duration, hold credit', status: 'proposed',
      grossNotionalUsd: 6.2e9, totalExecutionCost: 1.646e6, carryChangeUsd: -3.04e8,
      tickets: [
        {
          ticketId: 'TKT-01', securityId: 1, description: 'US TREASURY NOTE 4.750% 2036-09-07',
          side: 'SELL', notionalUsd: 1.11e9, executionCost: 2e5, carryUsd: -5e7,
          kind: 'Treasury', cusip: '912828YZ7', quotedPrice: '99-16+', decimalPrice: 99.515625,
          maturityDate: 20360907,
        },
        {
          ticketId: 'TKT-02', securityId: 2, description: 'CDX.NA.HY S46 V1 5%',
          side: 'BUY_PROTECTION', notionalUsd: 2.1e9, executionCost: 1e5, carryUsd: -1e8,
          kind: 'CDX', fixedCouponBp: 500, pointsUpfront: -1.25, immMaturity: 20310320,
          clearingHouse: 'ICE Clear Credit', executionVenue: 'SEF', family: 'CDX.NA.HY',
        },
      ],
    },
    exposureBefore: { level: -1.3e9, slope: -3.4e8, curvature: -2.6e8, hump: -2.8e8, credit: -1.14e9 },
    exposureAfter: { level: -6.63e8, slope: -2.39e8, curvature: -1.71e8, hump: -1.15e8, credit: -1.14e9 },
    coverage: { level: 0.98, slope: null, curvature: null, hump: null, credit: 1 },
    residual: { level: -1.3e7, slope: null, curvature: null, hump: null, credit: 0 },
    verification: {
      worlds: 200, horizonDays: 20,
      before: { worst: -1.27e9, var95: -7.8e8, cvar95: -9.99e8, median: -1.5e7, best: 1.47e9 },
      after: { worst: -8.67e8, var95: -5.4e8, cvar95: -6.27e8, median: 1e7, best: 7.85e8 },
      worstCaseBefore: -9.49e8, worstCaseAfter: -5.9e8,
      distributionBefore: [{ from: -1.3e9, to: 0, count: 120 }, { from: 0, to: 1.5e9, count: 80 }],
      distributionAfter: [{ from: -9e8, to: 0, count: 110 }, { from: 0, to: 8e8, count: 90 }],
    },
    plausibility: '200 worlds drawn from the model',
  };

  const payload: ScenarioCellPayload = {
    kind: SCENARIO_CELL, view: 'package', bookFingerprint: 'bk-abc', positionCount: 0,
    baseMarketValue: 0, headline: '2 legs verified', plausibility: '200 worlds drawn from the model',
    solve,
  };

  it('names the package and shows what it cost', () => {
    render(<ScenarioResultCell payload={payload} />);
    expect(screen.getByText(/Package — Halve duration, hold credit/)).toBeInTheDocument();
    expect(screen.getByText('1646k')).toBeInTheDocument();
    expect(screen.getByText('−$304.0mm/yr')).toBeInTheDocument();
  });

  it('overlays the two distributions on one shared scale', () => {
    render(<ScenarioResultCell payload={payload} />);
    expect(screen.getByRole('img', { name: /before hedging/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /after hedging/i })).toBeInTheDocument();
  });

  it('reports coverage per factor, including the ones left unconstrained', () => {
    render(<ScenarioResultCell payload={payload} />);
    expect(screen.getByText('98% covered')).toBeInTheDocument();
    expect(screen.getAllByText('unconstrained').length).toBe(3);
    expect(screen.getByText('Every target was met to within 5%.')).toBeInTheDocument();
  });

  it('shows each ticket with the fields its own product needs', () => {
    render(<ScenarioResultCell payload={payload} />);
    // A Treasury quotes in 32nds; a swap quotes points upfront.
    expect(screen.getByText('99-16+')).toBeInTheDocument();
    expect(screen.getByText('-1.25 puf')).toBeInTheDocument();
    expect(screen.getByText('BUY PROT')).toBeInTheDocument();
    expect(screen.getByText('SELL')).toBeInTheDocument();
  });

  it('says the package is only proposed', () => {
    render(<ScenarioResultCell payload={payload} />);
    expect(screen.getByText(/2 tickets · proposed · PKG-01/)).toBeInTheDocument();
  });
});
