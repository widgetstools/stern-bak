import type { LabDemoProfileEntry } from '../labProfileKit';
import { ALERTS_TAB_STATE } from '../../seeds/alerts';
import {
  DEFAULT_ALERTS_SETTINGS,
  type AlertRule,
  type AlertsSettings,
  type AlertsState,
} from '@wellsfargo-starui/engine';

export const ALERTS_GRID_ID = 'lab-alerts-v2';

function cloneRule(rule: AlertRule, patch: Partial<AlertRule> = {}): AlertRule {
  return { ...structuredClone(rule), ...patch };
}

function alertsState(
  rules: AlertRule[],
  settings: Partial<AlertsSettings> = {},
): AlertsState {
  return {
    rules,
    history: [],
    settings: {
      ...DEFAULT_ALERTS_SETTINGS,
      defaultDebounceMs: 1500,
      maxNotificationsPerSecond: 5,
      historyLimit: 200,
      enabledChannels: { toast: true, badge: true, openfin: true },
      evaluationMode: 'realtime',
      ...settings,
    },
  };
}

const R = ALERTS_TAB_STATE.rules;
const byId = (id: string) => {
  const rule = R.find((r) => r.id === id);
  if (!rule) throw new Error(`missing alert rule ${id}`);
  return rule;
};

export const ALERTS_DEMO_PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'alert-00-full-demo',
    name: '00 · Full demo',
    blurb: 'All trigger families + mixed channels.',
    seed: { alerts: ALERTS_TAB_STATE },
  },
  {
    id: 'alert-01-data-change',
    name: '01 · Data-change',
    blurb: 'Expression predicates on bid + daily P&L.',
    seed: {
      alerts: alertsState(
        [
          cloneRule(byId('alert-bid-spike'), { enabled: true }),
          cloneRule(byId('alert-loss-cluster'), { enabled: true }),
        ],
        { maxNotificationsPerSecond: 8 },
      ),
    },
  },
  {
    id: 'alert-02-relative-change',
    name: '02 · Relative-change',
    blurb: 'Mid % move threshold.',
    seed: {
      alerts: alertsState([cloneRule(byId('alert-mid-move'), { enabled: true })], {
        maxNotificationsPerSecond: 8,
      }),
    },
  },
  {
    id: 'alert-03-row-change',
    name: '03 · Row add/remove',
    blurb: 'ROW_ADDED + ROW_REMOVED (needs add/remove feed).',
    seed: {
      alerts: alertsState(
        [
          cloneRule(byId('alert-row-added'), { enabled: true }),
          cloneRule(byId('alert-row-removed'), { enabled: true }),
        ],
        { maxNotificationsPerSecond: 10 },
      ),
    },
  },
  {
    id: 'alert-04-toast-channel',
    name: '04 · Toast only',
    blurb: 'Toast channel on; badge off globally.',
    seed: {
      alerts: alertsState(
        [
          cloneRule(byId('alert-bid-spike'), { enabled: true, channels: ['toast'], debounceMs: 2000 }),
          cloneRule(byId('alert-mid-move'), { enabled: true, channels: ['toast'], debounceMs: 2000 }),
        ],
        { enabledChannels: { toast: true, badge: false, openfin: false }, maxNotificationsPerSecond: 6 },
      ),
    },
  },
  {
    id: 'alert-05-badge-channel',
    name: '05 · Badge only',
    blurb: 'Bell history only.',
    seed: {
      alerts: alertsState(
        [
          cloneRule(byId('alert-bid-spike'), { enabled: true, channels: ['badge'] }),
          cloneRule(byId('alert-mid-move'), { enabled: true, channels: ['badge'] }),
        ],
        { enabledChannels: { toast: false, badge: true, openfin: false } },
      ),
    },
  },
  {
    id: 'alert-06-rate-limit',
    name: '06 · Rate limit',
    blurb: 'Hot rules; cap 1 notification/sec.',
    seed: {
      alerts: alertsState(
        [
          cloneRule(byId('alert-bid-spike'), { enabled: true, debounceMs: 0 }),
          cloneRule(byId('alert-mid-move'), { enabled: true, debounceMs: 0 }),
          cloneRule(byId('alert-price-tick'), { enabled: true, channels: ['badge'], debounceMs: 0 }),
        ],
        { maxNotificationsPerSecond: 1, defaultDebounceMs: 0 },
      ),
    },
  },
  {
    id: 'alert-07-debounce',
    name: '07 · Debounce',
    blurb: '8s debounce on bid spikes.',
    seed: {
      alerts: alertsState([cloneRule(byId('alert-bid-spike'), { enabled: true, debounceMs: 8000 })], {
        defaultDebounceMs: 8000,
      }),
    },
  },
  {
    id: 'alert-08-paused',
    name: '08 · Paused',
    blurb: 'Rules loaded; evaluation paused.',
    seed: {
      alerts: alertsState(
        [
          cloneRule(byId('alert-bid-spike'), { enabled: true }),
          cloneRule(byId('alert-mid-move'), { enabled: true }),
        ],
        { evaluationMode: 'paused' },
      ),
    },
  },
];

export const ALERTS_ACTIVE_PROFILE_ID = 'alert-00-full-demo';
