import type { AlertRule, AlertsState } from '@wellsfargo-starui/core';

/**
 * Demo alert rules for the Alerts tab. Mix every trigger family + every
 * notification channel so the user sees a representative sweep on first load.
 *
 * Tuned conservatively against the mock stream's 500ms tick:
 *   - dataChange predicates use stable column thresholds that hit a handful
 *     of rows per second, not every row
 *   - relativeChange uses ANY_CHANGE on a low-frequency column so the demo
 *     fires often enough to be obvious without saturating the toast layer
 *     (the global `maxNotificationsPerSecond` cap absorbs bursts anyway)
 *   - rowChange rules exist but won't fire under the mock stream (which
 *     only updates existing rows). The host can still toggle these on to
 *     prove the surface works when wired against a real add/remove feed.
 */

const RULES: AlertRule[] = [
  {
    id: 'alert-bid-spike',
    name: 'Bid > $110',
    enabled: true,
    priority: 10,
    severity: 'warning',
    trigger: {
      kind: 'dataChange',
      expression: '[bidPrice] > 110',
      column: 'bidPrice',
    },
    message: '{rowId} bid hit {value}',
    channels: ['toast', 'badge', 'openfin'],
    debounceMs: 3000,
  },
  {
    id: 'alert-loss-cluster',
    name: 'Daily P&L < −$25k',
    enabled: true,
    priority: 5,
    severity: 'critical',
    trigger: {
      kind: 'dataChange',
      expression: '[dailyPnL] < -25000',
      column: 'dailyPnL',
    },
    message: '{rowId} {rule}: {value}',
    channels: ['toast', 'badge', 'openfin'],
    debounceMs: 5000,
  },
  {
    id: 'alert-yield-watch',
    name: 'YTW > 9%',
    enabled: false,
    priority: 20,
    severity: 'info',
    trigger: {
      kind: 'dataChange',
      expression: '[yieldToWorst] > 9',
      column: 'yieldToWorst',
    },
    message: '{rowId} yield {value}',
    channels: ['badge'],
    debounceMs: 10000,
  },
  {
    id: 'alert-mid-move',
    name: 'Mid moves > 0.5%',
    enabled: true,
    priority: 30,
    severity: 'info',
    trigger: {
      kind: 'relativeChange',
      column: 'midPrice',
      mode: 'PERCENT_CHANGE',
      threshold: 0.5,
      direction: 'both',
    },
    message: '{rowId} mid {prev} → {value}',
    channels: ['toast', 'badge'],
    debounceMs: 2000,
  },
  {
    id: 'alert-price-tick',
    name: 'Any change on last',
    enabled: false,
    priority: 40,
    severity: 'info',
    trigger: {
      kind: 'relativeChange',
      column: 'bidPrice',
      mode: 'ANY_CHANGE',
      direction: 'both',
    },
    message: '{rowId} bid → {value}',
    channels: ['badge'],
    // No debounce — but the global rate limiter still caps the burst.
  },
  {
    id: 'alert-row-added',
    name: 'New position appears',
    enabled: false,
    priority: 50,
    severity: 'success',
    trigger: { kind: 'rowChange', event: 'ROW_ADDED' },
    message: 'New row {rowId}',
    channels: ['toast', 'badge', 'openfin'],
  },
  {
    id: 'alert-row-removed',
    name: 'Position removed',
    enabled: false,
    priority: 50,
    severity: 'warning',
    trigger: { kind: 'rowChange', event: 'ROW_REMOVED' },
    message: 'Row {rowId} disappeared',
    channels: ['toast', 'badge', 'openfin'],
  },
];

export const ALERTS_TAB_STATE: AlertsState = {
  rules: RULES,
  history: [],
  settings: {
    enabled: true,
    defaultDebounceMs: 1500,
    maxNotificationsPerSecond: 5,
    historyLimit: 200,
    enabledChannels: { toast: true, badge: true, openfin: true },
    evaluationMode: 'realtime',
  },
};
