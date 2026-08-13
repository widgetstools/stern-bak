import type { LabDemoProfileEntry } from '../labProfileKit';
import { FORMATTING_CC_STATE } from '../../seeds/columnCustomization';

export const FORMATTING_GRID_ID = 'lab-formatting-v7';

const A = FORMATTING_CC_STATE.assignments;

export const FORMATTING_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'fmt-00-full-showcase',
    name: '00 · Full showcase',
    blurb: 'Every formatter kind — preset, Excel, tick, themed overrides.',
    seed: { 'column-customization': FORMATTING_CC_STATE },
  },
  {
    id: 'fmt-01-excel-pnl',
    name: '01 · Excel P&L',
    blurb: 'Check/cross and arrow P&L formatters only.',
    seed: {
      'column-customization': {
        assignments: {
          unrealizedPnL: A.unrealizedPnL,
          dailyPnL: A.dailyPnL,
          mtdPnL: A.mtdPnL,
          ytdPnL: A.ytdPnL,
        },
        globalCellNumberFormatter: FORMATTING_CC_STATE.globalCellNumberFormatter,
      },
    },
  },
  {
    id: 'fmt-02-yields-spreads',
    name: '02 · Yields & spreads',
    blurb: 'Chart %, fire OAS, bolt Z-spread, convexity diverging.',
    seed: {
      'column-customization': {
        assignments: {
          yieldToMaturity: A.yieldToMaturity,
          yieldToWorst: A.yieldToWorst,
          currentYield: A.currentYield,
          oas: A.oas,
          zSpread: A.zSpread,
          convexity: A.convexity,
        },
      },
    },
  },
  {
    id: 'fmt-03-pricing-precision',
    name: '03 · Pricing precision',
    blurb: '3dp bid/mid, 4dp ask, 32nds last, signed delta.',
    seed: {
      'column-customization': {
        assignments: {
          bidPrice: A.bidPrice,
          midPrice: A.midPrice,
          askPrice: A.askPrice,
          lastPrice: A.lastPrice,
          priceChange: A.priceChange,
          priceChangePct: A.priceChangePct,
        },
      },
    },
  },
  {
    id: 'fmt-04-themed-overrides',
    name: '04 · Themed overrides',
    blurb: 'Rating, sector, currency cell + header paints (no formatters).',
    seed: {
      'column-customization': {
        assignments: {
          compositeRating: A.compositeRating,
          issuerSector: A.issuerSector,
          currency: A.currency,
        },
      },
    },
  },
  {
    id: 'fmt-05-global-defaults',
    name: '05 · Global defaults',
    blurb: 'Global number + date formatters; bare columns otherwise.',
    seed: {
      'column-customization': {
        assignments: {},
        globalCellNumberFormatter: FORMATTING_CC_STATE.globalCellNumberFormatter,
        globalCellDateFormatter: FORMATTING_CC_STATE.globalCellDateFormatter,
      },
    },
  },
];

export const FORMATTING_ACTIVE_PROFILE_ID = 'fmt-00-full-showcase';
