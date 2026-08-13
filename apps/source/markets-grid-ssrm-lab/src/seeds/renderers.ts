import type { ColumnAssignment, ColumnCustomizationState } from '@wellsfargo-starui/grid/customizer';

function cr(
  kind: string,
  config: Record<string, unknown>,
): Pick<ColumnAssignment, 'cellRendererId' | 'cellRendererConfig'> {
  return {
    cellRendererId: kind,
    cellRendererConfig: { kind, config },
  };
}

export const RATING_PILL_CONFIG = {
  rules: [
    { value: 'AAA', bg: { dark: '#103418', light: '#d6f4dd' }, fg: { dark: '#7fdf9b', light: '#1f5d34' } },
    { value: 'AA+', bg: { dark: '#0e3046', light: '#dbeefd' }, fg: { dark: '#7cc7f9', light: '#0f4d75' } },
    { value: 'AA', bg: { dark: '#0e3046', light: '#dbeefd' }, fg: { dark: '#7cc7f9', light: '#0f4d75' } },
    { value: 'AA-', bg: { dark: '#0e3046', light: '#dbeefd' }, fg: { dark: '#7cc7f9', light: '#0f4d75' } },
    { value: 'A+', bg: { dark: '#102e3a', light: '#dfeef4' }, fg: { dark: '#7ec4d8', light: '#10495a' } },
    { value: 'A', bg: { dark: '#102e3a', light: '#dfeef4' }, fg: { dark: '#7ec4d8', light: '#10495a' } },
    { value: 'A-', bg: { dark: '#102e3a', light: '#dfeef4' }, fg: { dark: '#7ec4d8', light: '#10495a' } },
    { value: 'BBB+', bg: { dark: '#33310c', light: '#f7f1cc' }, fg: { dark: '#e5dd6f', light: '#5d551a' } },
    { value: 'BBB', bg: { dark: '#33310c', light: '#f7f1cc' }, fg: { dark: '#e5dd6f', light: '#5d551a' } },
    { value: 'BBB-', bg: { dark: '#33310c', light: '#f7f1cc' }, fg: { dark: '#e5dd6f', light: '#5d551a' } },
    { value: 'BB+', bg: { dark: '#3a2614', light: '#fbe7d7' }, fg: { dark: '#f0a576', light: '#7a3b14' } },
    { value: 'BB', bg: { dark: '#3a2614', light: '#fbe7d7' }, fg: { dark: '#f0a576', light: '#7a3b14' } },
    { value: 'B+', bg: { dark: '#3a1818', light: '#fcdada' }, fg: { dark: '#ee8e8e', light: '#7a1f1f' } },
    { value: 'B', bg: { dark: '#3a1818', light: '#fcdada' }, fg: { dark: '#ee8e8e', light: '#7a1f1f' } },
    { value: 'CCC', bg: { dark: '#3a1818', light: '#fcdada' }, fg: { dark: '#ee8e8e', light: '#7a1f1f' } },
  ],
  fallback: { bg: { dark: '#1f2733', light: '#e8edf2' }, fg: { dark: '#9aa6b2', light: '#3d4753' } },
};

export const SECTOR_PILL_CONFIG = {
  rules: [
    { value: 'Financials', bg: { dark: '#0f2b3f', light: '#dbeaf6' }, fg: { dark: '#7fc1ef', light: '#0e466b' } },
    { value: 'Utilities', bg: { dark: '#102e22', light: '#d8edd9' }, fg: { dark: '#79d3a3', light: '#1d5b2f' } },
    { value: 'Energy', bg: { dark: '#3a2310', light: '#fbe5cc' }, fg: { dark: '#f0a576', light: '#7a3a13' } },
    { value: 'Industrials', bg: { dark: '#1f2733', light: '#e8edf2' }, fg: { dark: '#9aa6b2', light: '#3d4753' } },
    { value: 'Sovereign', bg: { dark: '#23123a', light: '#ebdcf8' }, fg: { dark: '#b88bf0', light: '#4e1b86' } },
  ],
  fallback: { bg: { dark: '#1f2733', light: '#e8edf2' }, fg: { dark: '#9aa6b2', light: '#3d4753' } },
};

const A: Record<string, ColumnAssignment> = {
  compositeRating: {
    colId: 'compositeRating',
    headerName: 'Rating (pill)',
    ...cr('pill', RATING_PILL_CONFIG),
  },
  issuerSector: {
    colId: 'issuerSector',
    headerName: 'Sector (pill)',
    ...cr('pill', SECTOR_PILL_CONFIG),
  },
  issuerCountryCode: {
    colId: 'issuerCountryCode',
    headerName: 'Country',
    ...cr('country-flag', { codeField: 'issuerCountryCode' }),
  },
  currency: {
    colId: 'currency',
    headerName: 'Ccy',
    ...cr('country-flag', { codeField: 'currency' }),
  },
  priceChangePct: {
    colId: 'priceChangePct',
    headerName: 'Δ % (arrow)',
    ...cr('trend-arrow', {
      threshold: 0,
      colorScale: {
        up: { dark: '#7fdf9b', light: '#1f7a34' },
        down: { dark: '#ee8e8e', light: '#a02a2a' },
        flat: { dark: '#9aa6b2', light: '#5a6068' },
      },
    }),
  },
  modifiedDuration: {
    colId: 'modifiedDuration',
    headerName: 'Dur (bar)',
    ...cr('percent-bar', {
      max: 30,
      barColor: { dark: '#7cc7f9', light: '#1e6fb8' },
      showValue: true,
    }),
  },
  krdSparkline: {
    colId: 'krdSparkline',
    headerName: 'KRD (spark)',
    ...cr('sparkline', {
      lineColor: { dark: '#9aa6b2', light: '#3d4753' },
      fillColor: { dark: '#2a3340', light: '#e2e8ee' },
      strokeWidth: 1.25,
    }),
  },
  oas: {
    colId: 'oas',
    headerName: 'OAS (heat)',
    ...cr('heatmap', {
      domain: { min: 20, max: 600 },
      colorScale: {
        min: { dark: '#0f2b1c', light: '#e8f4ec' },
        mid: { dark: '#3a3010', light: '#fbf0cf' },
        max: { dark: '#3a1818', light: '#fcdada' },
      },
      textColor: { dark: '#e8edf2', light: '#1f2733' },
    }),
  },
  marketValue: {
    colId: 'marketValue',
    headerName: 'Mkt Val (bar)',
    ...cr('percent-bar', {
      fromField: { max: 50_000_000 },
      barColor: { dark: '#7cc7f9', light: '#1e6fb8' },
      showValue: true,
    }),
  },
  unrealizedPnL: { colId: 'unrealizedPnL', headerName: 'Unreal (PnL)', ...cr('pnl-value', {}) },
  dailyPnL: { colId: 'dailyPnL', headerName: 'Daily (PnL)', ...cr('pnl-value', {}) },
  ytdPnL: { colId: 'ytdPnL', headerName: 'YTD (PnL)', ...cr('pnl-value', {}) },
  lastUpdate: {
    colId: 'lastUpdate',
    headerName: 'Updated',
    ...cr('time-since', { sourceField: 'lastUpdate' }),
  },
};

export const RENDERERS_FULL_ASSIGNMENTS = { ...A };

export const RENDERERS_FULL_STATE: ColumnCustomizationState = {
  assignments: RENDERERS_FULL_ASSIGNMENTS,
};

const pick = (...ids: (keyof typeof A)[]) =>
  Object.fromEntries(ids.map((id) => [id, A[id]]));

export const RENDERERS_PILLS_ASSIGNMENTS = pick('compositeRating', 'issuerSector');
export const RENDERERS_CHARTS_ASSIGNMENTS = pick(
  'modifiedDuration',
  'krdSparkline',
  'oas',
  'marketValue',
);
export const RENDERERS_PNL_ASSIGNMENTS = pick('priceChangePct', 'unrealizedPnL', 'dailyPnL', 'ytdPnL', 'lastUpdate');
export const RENDERERS_FLAGS_ASSIGNMENTS = pick('issuerCountryCode', 'currency');
