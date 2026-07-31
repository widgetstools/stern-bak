import type { LabScenario } from './types';
import type { LabRow } from '../data/types';

function cloneRows(rows: readonly LabRow[]): LabRow[] {
  return rows.map((r) => ({ ...r }));
}

function patchRow(rows: LabRow[], index: number, patch: Partial<LabRow>): LabRow[] {
  if (index < 0 || index >= rows.length) return rows;
  rows[index] = { ...rows[index], ...patch };
  return rows;
}

function firstIndex(rows: readonly LabRow[], pred: (r: LabRow) => boolean): number {
  return rows.findIndex(pred);
}

function patchFirst(
  rows: readonly LabRow[],
  pred: (r: LabRow) => boolean,
  patch: Partial<LabRow>,
): LabRow[] {
  const next = cloneRows(rows);
  const i = Math.max(0, firstIndex(next, pred));
  return patchRow(next, i, patch);
}

function patchIndices(
  rows: readonly LabRow[],
  indices: number[],
  patch: Partial<LabRow> | ((row: LabRow, i: number) => Partial<LabRow>),
): LabRow[] {
  const next = cloneRows(rows);
  for (const i of indices) {
    if (i < 0 || i >= next.length) continue;
    const p = typeof patch === 'function' ? patch(next[i], i) : patch;
    patchRow(next, i, p);
  }
  return next;
}

const SCENARIOS: LabScenario[] = [
  // ─── Alerts & cross-tab market moves ───────────────────────────────
  {
    id: 'bid-spike',
    title: 'Bid spike',
    description: 'Push bid above $110 — fires data-change alert rules.',
    accent: 'warning',
    tabs: ['alerts', 'overview', 'live', 'profiles'],
    apply: (rows) =>
      patchFirst(rows, (r) => Number(r.bidPrice) > 0, {
        bidPrice: 112.5,
        midPrice: 112.25,
        askPrice: 112.75,
      }),
  },
  {
    id: 'pnl-loss',
    title: 'P&L loss cluster',
    description: 'Deep negative daily P&L — losers styling + alert thresholds.',
    accent: 'negative',
    tabs: ['alerts', 'conditional', 'overview', 'live', 'toolbar', 'profiles'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        dailyPnL: -42_500,
        unrealizedPnL: -18_200,
        mtdPnL: -95_000,
      }),
  },
  {
    id: 'mid-tick-up',
    title: 'Mid ticks up',
    description: 'Large mid bump — diff rules, relative-change alerts, tick flash.',
    accent: 'positive',
    tabs: ['conditional', 'live', 'alerts', 'formatting', 'overview'],
    apply: (rows) => {
      const next = cloneRows(rows);
      const i = Math.max(0, firstIndex(next, (r) => Number(r.midPrice) > 0));
      const mid = Number(next[i]?.midPrice ?? 100);
      return patchRow(next, i, {
        midPrice: mid + 0.12,
        priceChangePct: 0.85,
        bidPrice: mid + 0.1,
        askPrice: mid + 0.14,
      });
    },
  },
  {
    id: 'mid-tick-down',
    title: 'Mid ticks down',
    description: 'Sharp mid drop — rose diff styling and down-only delta alerts.',
    accent: 'negative',
    tabs: ['conditional', 'live', 'alerts', 'overview'],
    apply: (rows) => {
      const next = cloneRows(rows);
      const i = Math.max(0, firstIndex(next, (r) => Number(r.midPrice) > 0));
      const mid = Number(next[i]?.midPrice ?? 100);
      return patchRow(next, i, {
        midPrice: mid - 0.15,
        priceChangePct: -1.2,
        bidPrice: mid - 0.17,
        askPrice: mid - 0.13,
      });
    },
  },
  {
    id: 'high-yield',
    title: 'High yield watch',
    description: 'YTW above 9% — pulse flash + yield alert predicate.',
    accent: 'warning',
    tabs: ['conditional', 'alerts', 'formatting', 'overview', 'profiles'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        yieldToWorst: 9.45,
        yieldToMaturity: 8.9,
        compositeRating: 'BB',
      }),
  },
  {
    id: 'tick-burst',
    title: 'Tick burst',
    description: 'Large % move — one-shot flash rules on priceChangePct.',
    accent: 'warning',
    tabs: ['live', 'conditional', 'overview', 'profiles'],
    apply: (rows) =>
      patchFirst(rows, (r) => Number(r.midPrice) > 0, {
        priceChangePct: 2.8,
        midPrice: Number(rows[0]?.midPrice ?? 100) + 0.35,
      }),
  },

  // ─── Conditional styling ───────────────────────────────────────────
  {
    id: 'junk-row',
    title: 'Junk-rated row',
    description: 'BB− rating — row-scope conditional styling tint.',
    accent: 'negative',
    tabs: ['conditional', 'overview', 'renderers', 'profiles'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        compositeRating: 'BB-',
        issuerSector: 'Energy',
      }),
  },
  {
    id: 'wide-spread',
    title: 'Wide bid/ask',
    description: 'Spread > 10¢ — wide-spread rules and heatmap-friendly OAS.',
    accent: 'info',
    tabs: ['conditional', 'formatting', 'renderers', 'toolbar', 'overview', 'filters'],
    apply: (rows) => {
      const next = cloneRows(rows);
      const i = Math.max(0, firstIndex(next, (r) => Number(r.bidPrice) > 0));
      const mid = Number(next[i]?.midPrice ?? 100);
      return patchRow(next, i, {
        bidPrice: mid - 0.08,
        askPrice: mid + 0.08,
        oas: 520,
        bidAskWidthBps: 160,
      });
    },
  },
  {
    id: 'multi-loser-strip',
    title: 'Losers strip',
    description: 'Five rows deep in the red — cell + row styling at scale.',
    accent: 'negative',
    tabs: ['conditional', 'overview', 'toolbar', 'profiles', 'filters'],
    apply: (rows) =>
      patchIndices(rows, [0, 1, 2, 3, 4], (_, i) => ({
        dailyPnL: -12_000 - i * 8_500,
        unrealizedPnL: -4_000 - i * 2_000,
        priceChangePct: -0.4 - i * 0.15,
      })),
  },

  // ─── Formatting ────────────────────────────────────────────────────
  {
    id: 'par-bond',
    title: 'Par bond',
    description: 'Prices at 100 — clean numeric/date formatters on IG row.',
    accent: 'neutral',
    tabs: ['formatting', 'overview', 'groups', 'profiles'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        bidPrice: 99.98,
        midPrice: 100,
        askPrice: 100.02,
        lastPrice: 100,
        yieldToMaturity: 4.25,
        yieldToWorst: 4.2,
        compositeRating: 'A',
      }),
  },
  {
    id: 'heatmap-oas',
    title: 'OAS heat band',
    description: 'Spreads across the OAS domain — heatmap renderer showcase.',
    accent: 'info',
    tabs: ['renderers', 'formatting', 'groups', 'overview'],
    apply: (rows) => {
      const next = cloneRows(rows);
      for (let i = 0; i < Math.min(8, next.length); i++) {
        patchRow(next, i, { oas: 40 + i * 70 });
      }
      return next;
    },
  },

  // ─── Cell renderers ──────────────────────────────────────────────────
  {
    id: 'winner-pnl',
    title: 'Winner P&L',
    description: 'Positive P&L stack — emerald styling + pnl-value renderer.',
    accent: 'positive',
    tabs: ['conditional', 'renderers', 'calc', 'toolbar', 'profiles'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        dailyPnL: 128_400,
        unrealizedPnL: 45_000,
        mtdPnL: 310_000,
        ytdPnL: 890_000,
        marketValue: 12_500_000,
      }),
  },
  {
    id: 'rating-upgrade',
    title: 'Rating upgrade',
    description: 'AAA + Financials — pill renderers and sector palette.',
    accent: 'positive',
    tabs: ['renderers', 'conditional', 'formatting', 'overview'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        compositeRating: 'AAA',
        issuerSector: 'Financials',
        issuerCountryCode: 'US',
        currency: 'USD',
      }),
  },
  {
    id: 'large-notional',
    title: 'Large notional',
    description: 'Heavy market value — percent-bar renderer fills the cell.',
    accent: 'info',
    tabs: ['renderers', 'formatting', 'toolbar', 'overview'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        marketValue: 48_000_000,
        quantityFace: 50_000_000,
        weightInPortfolio: 4.8,
      }),
  },
  {
    id: 'krd-curve',
    title: 'KRD curve',
    description: 'Steep key-rate vector — sparkline renderer shape.',
    accent: 'info',
    tabs: ['renderers', 'groups', 'overview', 'profiles'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        krd1Y: 0.2,
        krd2Y: 0.5,
        krd5Y: 1.8,
        krd10Y: 4.2,
        krd30Y: 6.5,
        modifiedDuration: 8.4,
      }),
  },

  // ─── Column groups (multi-field snapshots) ─────────────────────────
  {
    id: 'pricing-ladder',
    title: 'Pricing ladder',
    description: 'Three rows with distinct bid/mid/ask — expand Pricing group.',
    accent: 'info',
    tabs: ['groups', 'overview', 'formatting', 'live', 'toolbar', 'profiles'],
    apply: (rows) =>
      patchIndices(rows, [0, 1, 2], (row, i) => {
        const mid = 98 + i * 1.5;
        return {
          ticker: `LADDER-${i + 1}`,
          bidPrice: mid - 0.04 - i * 0.01,
          midPrice: mid,
          askPrice: mid + 0.04 + i * 0.01,
          lastPrice: mid,
        };
      }),
  },
  {
    id: 'risk-yields-snapshot',
    title: 'Risk + yields',
    description: 'Duration, OAS, and yields — open Risk / Yields column groups.',
    accent: 'warning',
    tabs: ['groups', 'overview', 'calc', 'formatting', 'conditional', 'profiles'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        modifiedDuration: 11.8,
        oas: 285,
        yieldToMaturity: 6.35,
        yieldToWorst: 6.55,
        benchmarkYield: 4.1,
        dv01: 125_000,
      }),
  },

  // ─── Calculated columns ─────────────────────────────────────────────
  {
    id: 'calc-ultra-duration',
    title: 'Ultra duration',
    description: 'Mod dur 18y — Risk Bucket calc column reads "Ultra".',
    accent: 'warning',
    tabs: ['calc', 'overview', 'groups'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        modifiedDuration: 18,
        marketValue: 8_200_000,
        yieldToMaturity: 5.1,
      }),
  },
  {
    id: 'spread-to-bench',
    title: 'Spread to benchmark',
    description: 'Wide YTM vs bench — Sprd→Bench (bps) calc lights up.',
    accent: 'info',
    tabs: ['calc', 'formatting', 'overview'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        yieldToMaturity: 7.8,
        benchmarkYield: 4.0,
        modifiedDuration: 6.2,
      }),
  },
  {
    id: 'liquidity-surge',
    title: 'Liquidity surge',
    description: 'High 30d volume — Liquidity (log) calc column jumps.',
    accent: 'positive',
    tabs: ['calc', 'overview', 'profiles'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        avgDailyVolume30d: 2_500_000_000,
        ticker: 'LIQ-DEMO',
      }),
  },

  // ─── Quick filter pills ─────────────────────────────────────────────
  {
    id: 'corp-hy-book',
    title: 'HY book',
    description: 'CorpHY asset class — matches High yield pill.',
    accent: 'warning',
    tabs: ['filters', 'overview'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        assetClass: 'CorpHY',
        compositeRating: 'B+',
        issuerSector: 'Energy',
      }),
  },
  {
    id: 'agency-paper',
    title: 'Agency paper',
    description: 'Agency class — capture workflow + Agency set filter.',
    accent: 'info',
    tabs: ['filters'],
    apply: (rows) =>
      patchIndices(rows, [0, 1, 2], {
        assetClass: 'Agency',
        issuerSector: 'Financials',
      }),
  },
  {
    id: 'financials-sector',
    title: 'Financials sector',
    description: 'Sector pill + AND-stack profile demo.',
    accent: 'info',
    tabs: ['filters', 'overview'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        issuerSector: 'Financials',
        assetClass: 'CorpIG',
        compositeRating: 'A',
      }),
  },
  // ─── Editing tab ───────────────────────────────────────────────────
  {
    id: 'editing-qty-selection',
    title: 'Qty column focus',
    description: 'Distinct quantityFace values on first rows — select qty for Smart Edit / Bulk.',
    accent: 'info',
    tabs: ['editing'],
    apply: (rows) =>
      patchIndices(rows, [0, 1, 2], (row, i) => ({
        quantityFace: 1_000_000 * (i + 1),
      })),
  },
  {
    id: 'editing-validation-trap',
    title: 'Extreme qty values',
    description: 'Very large qty on row 0 — useful with preview-before-apply profile.',
    accent: 'warning',
    tabs: ['editing'],
    apply: (rows) =>
      patchFirst(rows, () => true, {
        quantityFace: 999_999_999,
        midPrice: 0.001,
      }),
  },
  {
    id: 'editing-multi-column',
    title: 'Mixed column values',
    description: 'Different qty and mid on adjacent rows — demo single-column guard.',
    accent: 'neutral',
    tabs: ['editing'],
    apply: (rows) => {
      const next = cloneRows(rows);
      patchRow(next, 0, { quantityFace: 10_000_000, midPrice: 98.5 });
      patchRow(next, 1, { quantityFace: 5_000_000, midPrice: 101.25 });
      return next;
    },
  },
];

export function scenariosForTab(tabId: string): LabScenario[] {
  return SCENARIOS.filter((s) => s.tabs.includes(tabId));
}

export function getScenarioById(id: string): LabScenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
