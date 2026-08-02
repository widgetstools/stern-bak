import {
  applyGridDensityToTheme,
  staruiGridTheme,
} from '@wellsfargo-starui/design-system/adapters/ag-grid';

/** Standard density grid theme (token-driven, switches via data-ag-theme-mode). */
export const gridTheme = staruiGridTheme;
/** Dense blotter density for the Market/Orders blotters — same token theme,
 *  ultra density, matching the guidance the Overview section teaches. */
export const blotterTheme = applyGridDensityToTheme(staruiGridTheme, 'ultra');
