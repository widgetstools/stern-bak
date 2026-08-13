import type { SavedFiltersState } from '@wellsfargo-starui/grid/customizer';

interface FilterPill {
  id: string;
  label: string;
  active: boolean;
  filterModel: Record<string, unknown>;
}

function pill(
  id: string,
  label: string,
  active: boolean,
  filterModel: Record<string, unknown>,
): FilterPill {
  return { id, label, active, filterModel };
}

const setFilter = (field: string, values: string[]) => ({
  [field]: { filterType: 'set', values },
});

const numLt = (field: string, value: number) => ({
  [field]: { filterType: 'number', type: 'lessThan', filter: value },
});

const numGt = (field: string, value: number) => ({
  [field]: { filterType: 'number', type: 'greaterThan', filter: value },
});

/** Six pre-built pills — default curriculum for the Quick Filters tab. */
export const QUICK_FILTERS_CURRICULUM: SavedFiltersState = {
  filters: [
    pill('qf-rates', 'Rates', true, setFilter('assetClass', ['Rates'])),
    pill('qf-corp-ig', 'Corp IG', false, setFilter('assetClass', ['CorpIG'])),
    pill('qf-hy', 'High yield', false, setFilter('assetClass', ['CorpHY'])),
    pill('qf-financials', 'Financials', false, setFilter('issuerSector', ['Financials'])),
    pill('qf-losers', 'P&L losers', false, numLt('dailyPnL', 0)),
    pill('qf-wide-oas', 'OAS > 300', false, numGt('oas', 300)),
  ],
};

export const QUICK_FILTERS_RATES_ONLY: SavedFiltersState = {
  filters: [pill('qf-rates', 'Rates', true, setFilter('assetClass', ['Rates']))],
};

export const QUICK_FILTERS_CORP_IG: SavedFiltersState = {
  filters: [pill('qf-corp-ig', 'Corp IG', true, setFilter('assetClass', ['CorpIG']))],
};

export const QUICK_FILTERS_HY: SavedFiltersState = {
  filters: [pill('qf-hy', 'High yield', true, setFilter('assetClass', ['CorpHY']))],
};

export const QUICK_FILTERS_ENERGY: SavedFiltersState = {
  filters: [pill('qf-energy', 'Energy', true, setFilter('issuerSector', ['Energy']))],
};

export const QUICK_FILTERS_LOSERS: SavedFiltersState = {
  filters: [pill('qf-losers', 'P&L losers', true, numLt('dailyPnL', 0))],
};

/** Two active pills — AND composition (Rates ∩ Financials). */
export const QUICK_FILTERS_AND_STACK: SavedFiltersState = {
  filters: [
    pill('qf-rates', 'Rates', true, setFilter('assetClass', ['Rates'])),
    pill('qf-financials', 'Financials', true, setFilter('issuerSector', ['Financials'])),
  ],
};

/** Empty toolbar — use column filters + Funnel+ to capture a new pill. */
export const QUICK_FILTERS_EMPTY: SavedFiltersState = {
  filters: [],
};
