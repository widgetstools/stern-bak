import type { LabDemoProfileEntry } from '../labProfileKit';
import {
  QUICK_FILTERS_AND_STACK,
  QUICK_FILTERS_CORP_IG,
  QUICK_FILTERS_CURRICULUM,
  QUICK_FILTERS_EMPTY,
  QUICK_FILTERS_ENERGY,
  QUICK_FILTERS_HY,
  QUICK_FILTERS_LOSERS,
  QUICK_FILTERS_RATES_ONLY,
} from '../../seeds/savedFilters';

export const QUICK_FILTERS_GRID_ID = 'lab-quick-filters-v1';

export const QUICK_FILTERS_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'qf-00-curriculum',
    name: '00 · Filter pills',
    blurb: 'Six saved filters — toggle pills, counts, capture (+).',
    seed: { 'saved-filters': QUICK_FILTERS_CURRICULUM },
  },
  {
    id: 'qf-01-rates',
    name: '01 · Rates only',
    blurb: 'Single active pill — UST / curve book.',
    seed: { 'saved-filters': QUICK_FILTERS_RATES_ONLY },
  },
  {
    id: 'qf-02-corp-ig',
    name: '02 · Corp IG',
    blurb: 'Investment-grade corporates via asset class.',
    seed: { 'saved-filters': QUICK_FILTERS_CORP_IG },
  },
  {
    id: 'qf-03-hy',
    name: '03 · High yield',
    blurb: 'CorpHY asset class slice.',
    seed: { 'saved-filters': QUICK_FILTERS_HY },
  },
  {
    id: 'qf-04-energy',
    name: '04 · Energy sector',
    blurb: 'Issuer sector set filter.',
    seed: { 'saved-filters': QUICK_FILTERS_ENERGY },
  },
  {
    id: 'qf-05-losers',
    name: '05 · P&L losers',
    blurb: 'Number filter — daily P&L < 0.',
    seed: { 'saved-filters': QUICK_FILTERS_LOSERS },
  },
  {
    id: 'qf-06-and-stack',
    name: '06 · AND stack',
    blurb: 'Rates + Financials both active — intersecting pills.',
    seed: { 'saved-filters': QUICK_FILTERS_AND_STACK },
  },
  {
    id: 'qf-07-capture',
    name: '07 · Capture workflow',
    blurb: 'Empty toolbar — set a column filter, then Funnel+.',
    seed: { 'saved-filters': QUICK_FILTERS_EMPTY },
  },
];

export const QUICK_FILTERS_ACTIVE_PROFILE_ID = 'qf-00-curriculum';
