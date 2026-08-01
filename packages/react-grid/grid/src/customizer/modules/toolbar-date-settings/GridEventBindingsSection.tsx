import { useMemo, type ReactElement } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wellsfargo-starui/react';
import { SettingsRow as Row, SubLabel } from '../../ui/SettingsPanel';
import {
  boundHandlerForEvent,
  useGridEventBindingsHost,
  type GridEventBindingsMap,
} from '../../gridEventBindingsHost/GridEventBindingsHostContext';
import { marketsGridEventCatalogByCategory } from '../../../events/marketsGridEventCatalog.js';
import type { MarketsGridHandlerMeta } from '../../../events/marketsGridEventHandlers.js';

const NONE_VALUE = '__none__';

export interface GridEventBindingsSectionProps {
  /** When true, section title is rendered by the parent sidebar layout. */
  hideSectionHeader?: boolean;
  /** Staged bindings — rendered here, applied to the host on the panel's Save. */
  draft: GridEventBindingsMap;
  /** Patch one event's handler in the staged map (does NOT touch the host until Save). */
  onBindingChange(eventId: string, handlerId: string | null): void;
}

function handlerLabel(handlerId: string, meta: MarketsGridHandlerMeta | undefined): string {
  const entry = meta?.[handlerId];
  return entry?.label ?? handlerId;
}

export function GridEventBindingsSection({
  hideSectionHeader = false,
  draft,
  onBindingChange,
}: GridEventBindingsSectionProps): ReactElement | null {
  const host = useGridEventBindingsHost();

  const categories = useMemo(
    () => ['platform', 'provider', 'grid', 'toolbar'] as const,
    [],
  );

  if (!host?.available) {
    return (
      <div data-testid="grid-event-bindings-section">
        {!hideSectionHeader ? <SubLabel>EVENT CALLBACKS</SubLabel> : null}
        <p className="text-[11px] text-[color:var(--ds-text-secondary)]">
          Event bindings are available when the grid is hosted by MarketsGridContainer
          and the app supplies a handler registry.
        </p>
      </div>
    );
  }

  if (host.handlerIds.length === 0) {
    return (
      <div data-testid="grid-event-bindings-section">
        {!hideSectionHeader ? <SubLabel>EVENT CALLBACKS</SubLabel> : null}
        <p className="text-[11px] text-[color:var(--ds-text-secondary)]">
          No handlers registered — export `gridEventHandlers` from your app bootstrap.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="grid-event-bindings-section">
      {!hideSectionHeader ? <SubLabel>EVENT CALLBACKS</SubLabel> : null}
      <p className="mb-3 text-[11px] text-[color:var(--ds-text-secondary)]">
        Assign one app callback per grid event. Bindings persist at grid level
        (shared across profile switches) and apply when you Save this panel.
      </p>
      <div className="max-h-64 space-y-3 overflow-auto pr-1">
        {categories.map((category) => {
          const events = marketsGridEventCatalogByCategory(category);
          if (events.length === 0) return null;
          return (
            <div key={category} className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ds-text-secondary)]">
                {category}
              </div>
              {events.map((event) => {
                const selected = boundHandlerForEvent(draft, event.id);
                return (
                  <Row
                    key={event.id}
                    label={event.label}
                    hint={event.description}
                    data-testid={`grid-event-binding-${event.id}`}
                    control={(
                      <Select
                        value={selected ?? NONE_VALUE}
                        onValueChange={(v) => onBindingChange(
                          event.id,
                          v === NONE_VALUE ? null : v,
                        )}
                      >
                        <SelectTrigger
                          className="h-control-sm min-h-control-sm min-w-[200px] text-xs"
                          data-testid={`grid-event-handler-select-${event.id}`}
                        >
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          className="ds-sheet-v2 max-h-72"
                        >
                          <SelectItem value={NONE_VALUE} className="text-xs text-muted-foreground">
                            — None —
                          </SelectItem>
                          {host.handlerIds.map((handlerId) => (
                            <SelectItem key={handlerId} value={handlerId} className="text-xs">
                              {handlerLabel(handlerId, host.handlerMeta)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
