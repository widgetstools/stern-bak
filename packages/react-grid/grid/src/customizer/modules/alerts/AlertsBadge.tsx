/**
 * Toolbar bell — shows the unread alerts count, opens a popover with the
 * notification history. Also mounts the toast and OpenFin bridges so any
 * MarketsGrid that includes `<AlertsBadge>` in its toolbar gets the full
 * notification surface "for free".
 *
 * Mount once per MarketsGrid (`PrimaryToolbar` already calls this). The
 * component renders nothing when the alerts module isn't registered on
 * the active platform — safe to drop in unconditionally.
 *
 * All UI is shadcn (`Button`, `Badge`, `Popover`, `ScrollArea`,
 * `Separator`) per CLAUDE.md UI rules.
 */

import { Fragment, useCallback, useMemo } from 'react';
import { Bell, Check } from 'lucide-react';
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Separator,
} from '@wellsfargo-starui/ui';
import type { AlertsState } from '@wellsfargo-starui/engine';
import { useOptionalGridPlatform } from '../../hooks/GridProvider';
import { useModuleState } from '../../hooks/useModuleState';
import { useAlertsToastBridge } from './useAlertsToastBridge';
import { useAlertsOpenFinBridge } from './useAlertsOpenFinBridge';
import './AlertsBadge.css';

const MODULE_ID = 'alerts';

const SEVERITY_BADGE_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  info: 'secondary',
  success: 'default',
  warning: 'default',
  critical: 'destructive',
};

function safeFormatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

export function AlertsBadge() {
  // Optional platform — when this badge mounts outside a `<GridProvider>`
  // (e.g. characterisation tests that mount MarketsGrid without a real
  // platform) we silently render nothing rather than crashing the toolbar.
  const platform = useOptionalGridPlatform();

  // Bridge mounts — internal `useEffect` guards against null platform.
  // Both are no-ops when the alerts module isn't registered or when the
  // environment doesn't match (browser-only ⇒ no OpenFin dispatch).
  useAlertsToastBridge(platform);
  useAlertsOpenFinBridge(platform);

  return platform ? <AlertsBadgeInner /> : null;
}

function AlertsBadgeInner() {
  const [rawState, setState] = useModuleState<AlertsState | undefined>(MODULE_ID);
  const state = rawState;
  const unreadCount = useMemo(
    () => (state?.history ?? []).filter((n) => !n.read).length,
    [state],
  );
  const markAllRead = useCallback(() => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            history: prev.history.map((n) => (n.read ? n : { ...n, read: true })),
          }
        : prev,
    );
  }, [setState]);

  const clearHistory = useCallback(() => {
    setState((prev) => (prev ? { ...prev, history: [] } : prev));
  }, [setState]);

  // Module not registered on this grid — render nothing and skip the bell entirely.
  if (!state) return null;

  const badgeHidden = !state.settings.enabledChannels.badge;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Alerts (${unreadCount} unread)`}
          data-testid="alerts-badge-trigger"
          className="ds-primary-action relative"
        >
          <Bell size={14} strokeWidth={2} />
          {!badgeHidden && unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px] leading-none"
              data-testid="alerts-badge-count"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="ds-sheet-v2 ds-alerts-popover flex w-80 flex-col overflow-hidden p-0"
        data-testid="alerts-badge-popover"
      >
        <div className="flex shrink-0 items-center justify-between px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--ds-text-muted)]">
            Alerts ({state.history.length})
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              data-testid="alerts-badge-mark-read"
            >
              <Check size={12} className="mr-1" /> Mark read
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearHistory}
              disabled={state.history.length === 0}
              data-testid="alerts-badge-clear"
            >
              Clear
            </Button>
          </div>
        </div>
        <Separator className="ds-alerts-popover-divider" />
        <ScrollArea className="ds-alerts-popover-scroll h-80 w-full">
          {state.history.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-[color:var(--ds-text-muted)]">
              No alerts yet.
            </div>
          ) : (
            <div className="flex flex-col" role="list">
              {state.history.map((n, index) => (
                <Fragment key={n.id}>
                  {index > 0 ? <Separator className="ds-alerts-popover-divider" /> : null}
                  <div
                    role="listitem"
                    className="px-3 py-2"
                    data-testid={`alerts-notification-${n.id}`}
                    data-read={n.read ? 'true' : 'false'}
                  >
                    <div className="flex items-start gap-2">
                      <Badge
                        variant={SEVERITY_BADGE_VARIANT[n.severity] ?? 'secondary'}
                        className="mt-0.5 text-[10px] uppercase"
                      >
                        {n.severity}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium">{n.ruleName}</span>
                          <span className="shrink-0 text-[10px] text-[color:var(--ds-text-faint)]">
                            {safeFormatTime(n.firedAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 break-words text-xs text-[color:var(--ds-text-secondary)]">
                          {n.message}
                        </div>
                        {n.rowId && (
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--ds-text-faint)]">
                            row {n.rowId}
                            {n.column ? ` · col ${n.column}` : ''}
                          </div>
                        )}
                      </div>
                      {!n.read && (
                        <span
                          aria-label="unread"
                          className="ml-1 mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--ds-accent-primary)]"
                        />
                      )}
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
