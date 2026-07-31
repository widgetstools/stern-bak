import { useCallback, useEffect } from 'react';
import { todayIsoDate } from '../../../widget/toolbarDateUtils';
import { useAppDataLookup } from '../column-customization/editors/CellEditorEditor';
import { useModuleState } from '../../hooks/useModuleState';
import {
  applyHistoricalToolbarDateToAppData,
  resolveToolbarDateHistoryEnabled,
} from './applyHistoricalToolbarDateToAppData';
import {
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  type ToolbarDateSettingsState,
} from './state';

export function useToolbarDateSettingsBridge(opts: {
  toolbarDate: string;
  onToolbarDateChange: (next: string) => void;
  toolbarDateHistoryEnabled: boolean | undefined;
}): {
  toolbarDate: string;
  onToolbarDateChange: (next: string) => void;
  toolbarDateHistoryEnabled: boolean;
} {
  const [settings] = useModuleState<ToolbarDateSettingsState>(TOOLBAR_DATE_SETTINGS_MODULE_ID);
  const appData = useAppDataLookup();

  const toolbarDateHistoryEnabled = resolveToolbarDateHistoryEnabled(
    opts.toolbarDateHistoryEnabled,
    settings,
  );

  const onToolbarDateChange = useCallback(
    (next: string) => {
      applyHistoricalToolbarDateToAppData(next, settings, appData);
      opts.onToolbarDateChange(next);
    },
    [settings, appData, opts.onToolbarDateChange],
  );

  useEffect(() => {
    if (toolbarDateHistoryEnabled) return;
    const today = todayIsoDate();
    if (opts.toolbarDate !== today) {
      onToolbarDateChange(today);
    }
  }, [toolbarDateHistoryEnabled, opts.toolbarDate, onToolbarDateChange]);

  return {
    toolbarDate: opts.toolbarDate,
    onToolbarDateChange,
    toolbarDateHistoryEnabled,
  };
}
