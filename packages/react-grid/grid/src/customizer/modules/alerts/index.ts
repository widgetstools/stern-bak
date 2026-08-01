/**
 * Alerts — expression- and delta-driven notifications that fire on grid
 * data changes. Three trigger families ship in the P0:
 *
 *   dataChange      — boolean expression evaluated on cellValueChanged
 *   relativeChange  — numeric delta vs. previous value (PERCENT/ABSOLUTE/ANY)
 *   rowChange       — ROW_ADDED / ROW_REMOVED detected from modelUpdated diff
 *
 * Notifications dispatch to toast + toolbar badge channels. The module also
 * exposes a settings band in the customizer dialog so users can enable /
 * disable alerts globally, tune frequency (debounce, max-per-second), set
 * an evaluation mode (realtime / throttled / paused), and toggle the
 * notification channels.
 *
 * Layout — this file is the module shell only:
 *
 *   ./runtime/previousValues.ts   — per-(rowId, colId) baseline store
 *   ./runtime/dispatch.ts         — settings-aware notification dispatcher
 *   ./runtime/activate.ts         — AG-Grid event wiring + orchestration
 *   ./AlertsPanel.tsx             — ListPane / EditorPane / SettingsPanel
 *   ./AlertsBadge.tsx             — toolbar bell + notification popover
 */

import type { Module } from '@wellsfargo-starui/core';
import {
  deserializeAlertsState,
  INITIAL_ALERTS,
  type AlertsState,
} from '@wellsfargo-starui/core';
import { AlertsEditor, AlertsList, AlertsPanel } from './AlertsPanel';
import { activateAlerts } from './runtime/activate';

export const ALERTS_MODULE_ID = 'alerts';

export const alertsModule: Module<AlertsState> = {
  id: ALERTS_MODULE_ID,
  name: 'Alerts',
  code: '05',
  schemaVersion: 1,
  priority: 27,

  getInitialState: () => ({
    rules: [],
    history: [],
    settings: { ...INITIAL_ALERTS.settings },
  }),

  activate: activateAlerts,

  // Alerts don't transform column defs or grid options in P0 — the runtime
  // observes events emitted by other modules / the host data flow.

  serialize: (state) => ({
    rules: state.rules,
    settings: state.settings,
    // History is per-session — never persist. On reload, users start with
    // an empty notification list and rules begin firing fresh.
    history: [],
  }),

  deserialize: (raw) => deserializeAlertsState(raw),

  // Master-detail in the settings sheet — fixed rule header + scroll body
  // (same layout contract as Style Rules). SettingsPanel remains for hosts
  // that mount the flat combined layout.
  ListPane: AlertsList,
  EditorPane: AlertsEditor,
  SettingsPanel: AlertsPanel,
};

export { AlertsBadge } from './AlertsBadge';
export { useAlertsToastBridge } from './useAlertsToastBridge';
export { useAlertsOpenFinBridge } from './useAlertsOpenFinBridge';
