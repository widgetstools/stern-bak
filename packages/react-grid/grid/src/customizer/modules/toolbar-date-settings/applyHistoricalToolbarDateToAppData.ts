import type { AppDataLookup } from '@wellsfargo-starui/engine';
import { isoToDate, todayIsoDate } from '../../../widget/toolbarDateUtils';
import type { ToolbarDateSettingsState } from './state';

export function isHistoricalToolbarDate(iso: string): boolean {
  const selected = isoToDate(iso);
  const today = isoToDate(todayIsoDate());
  if (!selected || !today) return false;
  return selected.getTime() < today.getTime();
}

/** Write a past toolbar date to the configured AppData provider key. */
export function applyHistoricalToolbarDateToAppData(
  isoDate: string,
  settings: ToolbarDateSettingsState,
  appData: AppDataLookup | undefined,
): void {
  if (!settings.historicalDateAppDataEnabled) return;
  if (!settings.historicalDateAppDataProvider || !settings.historicalDateAppDataKey) return;
  if (!isHistoricalToolbarDate(isoDate)) return;
  if (!appData?.set) return;
  void appData.set(
    settings.historicalDateAppDataProvider,
    settings.historicalDateAppDataKey,
    isoDate,
  );
}

export function resolveToolbarDateHistoryEnabled(
  prop: boolean | undefined,
  settings: ToolbarDateSettingsState,
): boolean {
  if (prop !== undefined) return prop;
  return (
    settings.historicalDateAppDataEnabled
    && settings.historicalDateAppDataProvider.length > 0
    && settings.historicalDateAppDataKey.length > 0
  );
}
