export const TOOLBAR_DATE_SETTINGS_MODULE_ID = 'toolbar-date-settings';

export interface ToolbarDateSettingsState {
  /** When enabled, picking a past toolbar date writes ISO `YYYY-MM-DD` to AppData. */
  historicalDateAppDataEnabled: boolean;
  /** AppData provider instance name (e.g. `positions`). */
  historicalDateAppDataProvider: string;
  /** Key within the provider (e.g. `asOfDate`). */
  historicalDateAppDataKey: string;
  /**
   * DSL predicate that HIDES a row when it evaluates truthy — wired to
   * AG-Grid's external filter (`isExternalFilterPresent` /
   * `doesExternalFilterPass`). Column refs use bracket syntax, e.g.
   * `[ccy] == "INR"` or `[ccy] IN ["INR", "XXX"] OR [notional] < 0`.
   * The row stays in `rowData`; it's only hidden, so it reappears when
   * the offending value changes back. Empty = no exclusion. A parse or
   * eval failure excludes nothing (fails open) so the grid never hides
   * rows because of a bad expression.
   */
  rowExclusionExpression: string;
}

export const INITIAL_TOOLBAR_DATE_SETTINGS: ToolbarDateSettingsState = {
  historicalDateAppDataEnabled: false,
  historicalDateAppDataProvider: '',
  historicalDateAppDataKey: '',
  rowExclusionExpression: '',
};
