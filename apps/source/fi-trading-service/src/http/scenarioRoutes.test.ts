import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrap, type RunningService } from '../bootstrap.js';
import { loadConfig } from '../config.js';

let service: RunningService;
let base = '';

beforeAll(async () => {
  service = await bootstrap({
    ...loadConfig({}), port: 0, host: '127.0.0.1', logLevel: 'silent',
    bookScale: 0.15, tickRows: 0,
  });
  base = `http://127.0.0.1:${service.port}`;
}, 30_000);

afterAll(async () => {
  await service.close();
});

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('GET /api/book/summary', () => {
  it('describes the book the grid is showing', async () => {
    const summary = await (await fetch(`${base}/api/book/summary`)).json() as {
      positionCount: number; marketValue: number; fingerprint: string;
      byAssetClass: { assetClass: string; positions: number; marketValue: number }[];
    };
    expect(summary.positionCount).toBe(service.book.size());
    expect(summary.marketValue).toBeGreaterThan(0);
    expect(summary.fingerprint).toMatch(/^bk-/);
    expect(summary.byAssetClass.length).toBeGreaterThan(5);
    // Ordered by size, and the parts account for every position.
    expect(summary.byAssetClass.reduce((sum, b) => sum + b.positions, 0)).toBe(summary.positionCount);
    for (let i = 1; i < summary.byAssetClass.length; i++) {
      expect(summary.byAssetClass[i]?.marketValue)
        .toBeLessThanOrEqual(summary.byAssetClass[i - 1]?.marketValue as number);
    }
  });

  it('leaves the health route alone', async () => {
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});

describe('POST /api/scenario/scan', () => {
  it('returns a distribution with a histogram over the book on screen', async () => {
    const scan = await (await post('/api/scenario/scan', {
      worlds: 30, horizonDays: 6, reportWorst: 2,
    })).json() as Record<string, never> & {
      worlds: number; horizonDays: number; terminalPnl: number[];
      distribution: { count: number }[]; bookFingerprint: string; worstWorlds: unknown[];
      var95: number; median: number; revaluation: string;
    };
    expect(scan.worlds).toBe(30);
    expect(scan.horizonDays).toBe(6);
    expect(scan.terminalPnl).toHaveLength(30);
    expect(scan.distribution.reduce((sum, bin) => sum + bin.count, 0)).toBe(30);
    expect(scan.worstWorlds).toHaveLength(2);
    expect(scan.var95).toBeLessThanOrEqual(scan.median);
    expect(scan.revaluation).toBe('fast-path');
  });

  it('runs against the same book the summary reports', async () => {
    const summary = await (await fetch(`${base}/api/book/summary`)).json() as { fingerprint: string };
    const scan = await (await post('/api/scenario/scan', { worlds: 4, horizonDays: 2 })).json() as
      { bookFingerprint: string };
    expect(scan.bookFingerprint).toBe(summary.fingerprint);
  });

  it('clamps a request a model could plausibly make, instead of hanging', async () => {
    const scan = await (await post('/api/scenario/scan', {
      worlds: 1e9, horizonDays: 1e9, reportWorst: 500,
    })).json() as { worlds: number; horizonDays: number; worstWorlds: unknown[] };
    expect(scan.worlds).toBe(1000);
    expect(scan.horizonDays).toBe(252);
    expect(scan.worstWorlds.length).toBeLessThanOrEqual(10);
  }, 60_000);

  it('falls back to sane defaults for a bare request', async () => {
    const scan = await (await post('/api/scenario/scan', {})).json() as
      { worlds: number; horizonDays: number };
    expect(scan.worlds).toBe(200);
    expect(scan.horizonDays).toBe(20);
  }, 30_000);

  it('loses more under an imposed shock, and says so in its plausibility line', async () => {
    const plain = await (await post('/api/scenario/scan', { worlds: 25, horizonDays: 6 })).json() as
      { median: number };
    const shocked = await (await post('/api/scenario/scan', {
      worlds: 25, horizonDays: 6, shock: { level: 1.5, credit: 0.3, onDay: 1 },
    })).json() as { median: number; plausibility: string };
    expect(shocked.median).toBeLessThan(plain.median);
    expect(shocked.plausibility).toContain('150bp');
    expect(shocked.plausibility).toContain('day 1');
  });
});

describe('POST /api/scenario/fork', () => {
  it('holds every other draw fixed and reports what the shock alone cost', async () => {
    const fork = await (await post('/api/scenario/fork', {
      name: 'CPI 30bp hotter', worlds: 1, horizonDays: 8, shock: { level: 0.3, credit: 0.15, onDay: 2 },
    })).json() as {
      name: string; difference: { median: number; worst: number };
      actual: { median: number }; counterfactual: { median: number };
    };
    expect(fork.name).toBe('CPI 30bp hotter');
    expect(fork.counterfactual.median).toBeLessThan(fork.actual.median);
    expect(fork.difference.median).toBeCloseTo(fork.counterfactual.median - fork.actual.median, 6);
  });

  it('refuses a fork with nothing to fork on', async () => {
    const response = await post('/api/scenario/fork', { worlds: 1 });
    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toMatch(/needs a shock/);
  });

  it('names the counterfactual even when the caller does not', async () => {
    const fork = await (await post('/api/scenario/fork', {
      horizonDays: 3, shock: { credit: 0.2 },
    })).json() as { name: string };
    expect(fork.name).toBe('counterfactual');
  });
});

describe('POST /api/scenario/worst', () => {
  it('searches for the move that hurts this book most and explains why', async () => {
    const worst = await (await post('/api/scenario/worst', { horizonDays: 20, radius: 2.5 })).json() as {
      move: { level: number; credit: number }; actualPnl: number; predictedPnl: number;
      convexityEffect: number; explanation: string; plausibility: string; radius: number;
      byBucket: { bucket: string; pnl: number }[];
      exposure: { labels: string[]; standaloneLoss: number[] };
    };
    expect(worst.actualPnl).toBeLessThan(0);
    expect(worst.move.level).toBeGreaterThan(0);
    expect(worst.radius).toBe(2.5);
    expect(worst.convexityEffect).toBeCloseTo(worst.actualPnl - worst.predictedPnl, 6);
    expect(worst.explanation.length).toBeGreaterThan(40);
    expect(worst.plausibility).toContain('standard-deviation boundary');
    expect(worst.exposure.labels).toContain('credit');
    expect(worst.byBucket[0]?.pnl).toBeLessThan(0);
  });

  it('hurts more the further into the tail it is asked to look', async () => {
    const near = await (await post('/api/scenario/worst', { horizonDays: 10, radius: 1.5 })).json() as
      { actualPnl: number };
    const far = await (await post('/api/scenario/worst', { horizonDays: 10, radius: 4 })).json() as
      { actualPnl: number };
    expect(far.actualPnl).toBeLessThan(near.actualPnl);
  });

  it('clamps an absurd radius rather than reporting an impossible world', async () => {
    const result = await (await post('/api/scenario/worst', { radius: 500 })).json() as
      { radius: number };
    expect(result.radius).toBe(6);
  });
});
