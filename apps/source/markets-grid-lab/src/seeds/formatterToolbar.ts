import type { ColumnAssignment, ColumnCustomizationState } from '@wellsfargo-starui/grid/customizer';
import { bgText } from './styleHelpers';

const borderBottom = (dark: string, light: string) => ({
  dark: { borders: { bottom: { width: 2, color: dark, style: 'solid' as const } } },
  light: { borders: { bottom: { width: 2, color: light, style: 'solid' as const } } },
});

const A: Record<string, ColumnAssignment> = {
  cusip: {
    colId: 'cusip',
    headerStyleOverrides: {
      dark: { typography: { bold: true }, colors: { background: '#1a2433', text: '#9aa6b2' } },
      light: { typography: { bold: true }, colors: { background: '#e8edf2', text: '#3d4753' } },
    },
    cellStyleOverrides: {
      dark: { typography: { bold: true }, alignment: { horizontal: 'left' } },
      light: { typography: { bold: true }, alignment: { horizontal: 'left' } },
    },
  },
  ticker: {
    colId: 'ticker',
    cellStyleOverrides: {
      dark: { typography: { bold: true, fontSize: 13 }, colors: { text: '#7fdf9b' } },
      light: { typography: { bold: true, fontSize: 13 }, colors: { text: '#1f7a34' } },
    },
  },
  instrumentDescription: {
    colId: 'instrumentDescription',
    cellStyleOverrides: {
      dark: { typography: { italic: true }, colors: { text: '#9aa6b2' } },
      light: { typography: { italic: true }, colors: { text: '#5a6068' } },
    },
  },
  bidPrice: {
    colId: 'bidPrice',
    cellStyleOverrides: {
      dark: {
        ...bgText('#3a1818', '#fcdada', '#ee8e8e', '#7a1f1f').dark,
        borders: { bottom: { width: 2, color: '#ee8e8e', style: 'solid' } },
      },
      light: {
        ...bgText('#3a1818', '#fcdada', '#ee8e8e', '#7a1f1f').light,
        borders: { bottom: { width: 2, color: '#a02a2a', style: 'solid' } },
      },
    },
  },
  midPrice: {
    colId: 'midPrice',
    cellStyleOverrides: borderBottom('#7cc7f9', '#1e6fb8'),
  },
  askPrice: {
    colId: 'askPrice',
    cellStyleOverrides: bgText('#0f2b1c', '#e8f4ec', '#7fdf9b', '#1f7a34'),
  },
  dailyPnL: {
    colId: 'dailyPnL',
    cellStyleOverrides: {
      dark: { typography: { bold: true }, colors: { background: '#102e22', text: '#79d3a3' } },
      light: { typography: { bold: true }, colors: { background: '#d8edd9', text: '#1d5b2f' } },
    },
  },
  unrealizedPnL: {
    colId: 'unrealizedPnL',
    cellStyleOverrides: bgText('#33310c', '#f7f1cc', '#e5dd6f', '#5d551a'),
  },
  mtdPnL: {
    colId: 'mtdPnL',
    cellStyleOverrides: {
      dark: { alignment: { horizontal: 'right' }, colors: { text: '#7cc7f9' } },
      light: { alignment: { horizontal: 'right' }, colors: { text: '#0f4d75' } },
    },
  },
  compositeRating: {
    colId: 'compositeRating',
    cellStyleOverrides: bgText('#0e3046', '#dbeefd', '#7cc7f9', '#0f4d75'),
    headerStyleOverrides: {
      dark: { typography: { bold: true, underline: true }, colors: { text: '#7cc7f9' } },
      light: { typography: { bold: true, underline: true }, colors: { text: '#0f4d75' } },
    },
  },
  book: {
    colId: 'book',
    headerStyleOverrides: bgText('#23123a', '#ebdcf8', '#b88bf0', '#4e1b86'),
  },
  trader: {
    colId: 'trader',
    cellStyleOverrides: {
      dark: { typography: { underline: true }, alignment: { horizontal: 'center' } },
      light: { typography: { underline: true }, alignment: { horizontal: 'center' } },
    },
  },
};

export const FORMATTER_TOOLBAR_FULL_STATE: ColumnCustomizationState = {
  assignments: { ...A },
};

const pick = (...ids: (keyof typeof A)[]) =>
  Object.fromEntries(ids.map((id) => [id, A[id]]));

export const FORMATTER_TOOLBAR_TYPOGRAPHY = pick('ticker', 'instrumentDescription', 'trader');
export const FORMATTER_TOOLBAR_BORDERS = pick('bidPrice', 'midPrice', 'askPrice');
export const FORMATTER_TOOLBAR_PNL = pick('dailyPnL', 'unrealizedPnL', 'mtdPnL');
export const FORMATTER_TOOLBAR_HEADERS = pick('cusip', 'compositeRating', 'book');
