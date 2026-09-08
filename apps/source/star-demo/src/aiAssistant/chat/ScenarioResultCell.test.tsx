import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScenarioResultCell } from './ScenarioResultCell';
import { SCENARIO_CELL, type ScenarioCellPayload } from '../scenarioTools';

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
