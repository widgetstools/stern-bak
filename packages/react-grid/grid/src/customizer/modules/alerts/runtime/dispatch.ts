/**
 * Hit → notification dispatcher.
 *
 * Reads live `settings` from platform state on every call so toggling
 * `settings.enabled` or changing `settings.evaluationMode` takes effect
 * immediately without re-subscribing.
 *
 * Two guards prevent toast spam:
 *   1. Per-(rule, row) debounce — `rule.debounceMs ?? settings.defaultDebounceMs`
 *   2. Global token bucket — `settings.maxNotificationsPerSecond`
 *
 * Dropped hits are silent — counted internally for telemetry only.
 */

import type { PlatformHandle } from '@wellsfargo-starui/engine';
import {
  capHistory,
  renderMessage,
  type AlertChannel,
  type AlertHit,
  type AlertNotification,
  type AlertRule,
  type AlertsState,
} from '@wellsfargo-starui/engine';

export interface DispatchCounters {
  /** Total hits handed to dispatch. */
  evaluated: number;
  /** Notifications that survived all gates and landed in history. */
  fired: number;
  /** Hits dropped by per-(rule, row) debounce. */
  droppedByDebounce: number;
  /** Hits dropped by global notifications/sec token bucket. */
  droppedByRateLimit: number;
}

export interface AlertDispatcher {
  dispatch(rule: AlertRule, hit: AlertHit): void;
  counters(): Readonly<DispatchCounters>;
  /** Clears per-rule timers — call on profile switch or rules-list mutation. */
  reset(): void;
}

const RATE_WINDOW_MS = 1000;

export function createAlertDispatcher(
  platform: PlatformHandle<AlertsState>,
): AlertDispatcher {
  const lastFiredByKey = new Map<string, number>();
  const rateWindowTimestamps: number[] = [];
  const counters: DispatchCounters = {
    evaluated: 0,
    fired: 0,
    droppedByDebounce: 0,
    droppedByRateLimit: 0,
  };

  let notificationSeq = 0;
  const nextNotificationId = (): string => {
    notificationSeq = (notificationSeq + 1) | 0;
    return `${Date.now().toString(36)}-${notificationSeq.toString(36)}`;
  };

  return {
    dispatch(rule, hit) {
      counters.evaluated += 1;
      const state = platform.getState();
      const settings = state.settings;
      if (!settings.enabled || settings.evaluationMode === 'paused') return;
      if (!rule.enabled) return;

      // Per-(rule, row) debounce.
      const now = Date.now();
      const effectiveDebounce =
        typeof rule.debounceMs === 'number' && rule.debounceMs >= 0
          ? rule.debounceMs
          : settings.defaultDebounceMs;
      if (effectiveDebounce > 0) {
        const key = `${rule.id}::${hit.rowId}`;
        const last = lastFiredByKey.get(key);
        if (last !== undefined && now - last < effectiveDebounce) {
          counters.droppedByDebounce += 1;
          return;
        }
        lastFiredByKey.set(key, now);
      }

      // Global token bucket — at most `maxNotificationsPerSecond` per rolling 1s window.
      const cap = settings.maxNotificationsPerSecond;
      while (rateWindowTimestamps.length > 0 && now - rateWindowTimestamps[0] >= RATE_WINDOW_MS) {
        rateWindowTimestamps.shift();
      }
      if (rateWindowTimestamps.length >= cap) {
        counters.droppedByRateLimit += 1;
        return;
      }
      rateWindowTimestamps.push(now);

      // Resolve channels: rule.channels ∩ settings.enabledChannels.
      // (The openfin channel only fires when the browser bridge detects
      // `window.fin` at subscribe time — the dispatcher itself is environment-agnostic.)
      const channels: AlertChannel[] = rule.channels.filter((c) => {
        if (c === 'toast') return settings.enabledChannels.toast;
        if (c === 'badge') return settings.enabledChannels.badge;
        if (c === 'openfin') return settings.enabledChannels.openfin;
        return false;
      });
      if (channels.length === 0) return;

      const notification: AlertNotification = {
        id: nextNotificationId(),
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        message: renderMessage(rule.message, hit, rule.name),
        rowId: hit.rowId,
        column: hit.column,
        value: hit.value,
        prevValue: hit.prevValue,
        firedAt: now,
        read: false,
      };

      platform.setState((prev) => ({
        ...prev,
        history: capHistory([notification, ...prev.history], prev.settings.historyLimit),
      }));
      counters.fired += 1;
    },
    counters() {
      return counters;
    },
    reset() {
      lastFiredByKey.clear();
      rateWindowTimestamps.length = 0;
    },
  };
}
