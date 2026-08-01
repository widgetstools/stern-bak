import { useMemo, type ReactElement } from 'react';
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wellsfargo-starui/react';
import { CalendarIcon, Pencil, RefreshCw, RotateCw } from 'lucide-react';
import type { DataProviderConfig } from '@wellsfargo-starui/shared-types';
import { SettingsRow as Row, SubLabel } from '../../ui/SettingsPanel';
import {
  useProviderGridHost,
  type ProviderGridHostMode,
} from '../../providerGridHost/ProviderGridHostContext';

/**
 * The provider SETTINGS that the Custom Settings panel stages and applies
 * only on Save (live/historical provider + mode + as-of date). Imperative
 * actions (refresh/reload/edit) are NOT part of this — they fire immediately.
 */
export interface ProviderSelectionDraft {
  liveProviderId: string | null;
  historicalProviderId: string | null;
  mode: ProviderGridHostMode;
  asOfDate: string | null;
}

function isoToDate(iso: string | null): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function dateToIso(date: Date | undefined): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ProviderSelectRow({
  label,
  testId,
  value,
  providers,
  onChange,
  disabled,
}: {
  label: string;
  testId: string;
  value: string | null;
  providers: readonly DataProviderConfig[];
  onChange(id: string | null): void;
  disabled?: boolean;
}): ReactElement {
  return (
    <Row
      label={label}
      hint="Saved DataProvider config attached to this grid instance."
      data-testid={testId}
      control={(
        <Select
          value={value ?? '__none__'}
          onValueChange={(v) => onChange(v === '__none__' ? null : v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-control-sm min-h-control-sm min-w-[220px] text-xs" data-testid={testId}>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs text-muted-foreground">— None —</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.providerId} value={p.providerId!} className="text-xs">
                {p.name}
                <span className="ml-2 text-[10px] uppercase text-muted-foreground">{p.providerType}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

export interface ProviderGridHostSectionProps {
  /** When true, section title is rendered by the parent sidebar layout. */
  hideSectionHeader?: boolean;
  /** Staged selection — rendered here, applied to the host on the panel's Save. */
  draft: ProviderSelectionDraft;
  /** Patch the staged selection (does NOT touch the host until Save). */
  onDraftChange(patch: Partial<ProviderSelectionDraft>): void;
}

export function ProviderGridHostSection({
  hideSectionHeader = false,
  draft,
  onDraftChange,
}: ProviderGridHostSectionProps): ReactElement | null {
  const host = useProviderGridHost();
  // Active id follows the STAGED selection so Edit targets what's shown.
  const activeId = draft.mode === 'live' ? draft.liveProviderId : draft.historicalProviderId;

  const selectedDate = useMemo(() => isoToDate(draft.asOfDate), [draft.asOfDate]);

  if (!host?.available) {
    return (
      <div data-testid="provider-grid-host-section">
        {!hideSectionHeader ? <SubLabel>DATA PROVIDER</SubLabel> : null}
        <p className="text-[11px] text-[color:var(--ds-text-secondary)]">
          Provider selection and refresh controls are available when the grid
          is hosted by MarketsGridContainer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="provider-grid-host-section">
      {!hideSectionHeader ? <SubLabel>DATA PROVIDER</SubLabel> : null}
      <p className="mb-3 text-[11px] text-[color:var(--ds-text-secondary)]">
        Grid-level provider selection persists across profile switches.
        Selections apply when you Save this panel; the actions below
        (Refresh / Reload / Edit) run immediately.
      </p>

      <ProviderSelectRow
        label="LIVE"
        testId="provider-live-select"
        value={draft.liveProviderId}
        providers={host.liveProviders}
        onChange={(id) => onDraftChange({ liveProviderId: id })}
      />

      <ProviderSelectRow
        label="HISTORICAL"
        testId="provider-hist-select"
        value={draft.historicalProviderId}
        providers={host.historicalProviders}
        onChange={(id) => onDraftChange({ historicalProviderId: id })}
        disabled={host.historicalProviders.length === 0 && draft.historicalProviderId === null}
      />

      <Row
        label="MODE"
        hint="Switch between live streaming and historical snapshot providers."
        data-testid="provider-mode-toggle"
        control={(
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={draft.mode === 'live' ? 'default' : 'outline'}
              className="text-xs"
              onClick={() => onDraftChange({ mode: 'live' })}
              disabled={!draft.liveProviderId}
            >
              Live
            </Button>
            <Button
              type="button"
              size="sm"
              variant={draft.mode === 'historical' ? 'default' : 'outline'}
              className="text-xs"
              onClick={() => onDraftChange({ mode: 'historical' })}
              disabled={!draft.historicalProviderId}
            >
              Hist
            </Button>
          </div>
        )}
      />

      {draft.mode === 'historical' && draft.historicalProviderId ? (
        <Row
          label="AS OF"
          hint="Historical snapshot date (ISO YYYY-MM-DD)."
          data-testid="provider-asof-date"
          control={(
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="justify-start font-mono text-xs">
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {draft.asOfDate ?? <span className="text-muted-foreground">Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => onDraftChange({ asOfDate: dateToIso(d) })}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          )}
        />
      ) : null}

      <Row
        label="ACTIONS"
        hint="Refresh replays hub cache; Reload reconnects upstream."
        data-testid="provider-actions"
        control={(
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={host.onRefreshView}
              data-testid="provider-refresh-view"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh view
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={host.onReloadFromSource}
              data-testid="provider-reload-from-source"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Reload
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-control-sm p-0"
              onClick={() => activeId && host.onEditProvider(activeId)}
              disabled={!activeId}
              title="Edit selected provider"
              data-testid="provider-edit-selected"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      />
    </div>
  );
}
