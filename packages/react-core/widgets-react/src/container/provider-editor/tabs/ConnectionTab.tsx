/**
 * ConnectionTab — picks the right per-transport fields component and
 * surfaces a "Test Connection" button under it.
 *
 * The actual connection-test logic lives in `useProviderProbe`, which
 * dispatches to `probeStomp` / `probeRest` from `@wellsfargo-starui/host-data/runtime`.
 * The hook is owned by EditorForm and passed in (since FieldsTab also
 * needs the same probe state).
 */

import { Button, ScrollArea } from '@wellsfargo-starui/ui';
import { CheckCircle2, Loader2, Plug, XCircle } from 'lucide-react';
import type { ProviderConfig, StompProviderConfig, RestProviderConfig, MockProviderConfig, AppDataProviderConfig } from '@wellsfargo-starui/shared-types';
import { StompFields } from '../transports/StompFields.js';
import { RestFields } from '../transports/RestFields.js';
import { MockFields } from '../transports/MockFields.js';
import { AppDataFields } from '../transports/AppDataFields.js';
import type { ProbeState } from '../useProviderProbe.js';

export interface ConnectionTabProps {
  cfg: ProviderConfig;
  onCfgChange(next: Partial<ProviderConfig>): void;
  probe: ProbeState;
}

export function ConnectionTab({ cfg, onCfgChange, probe }: ConnectionTabProps) {
  const showTest = cfg.providerType === 'stomp' || cfg.providerType === 'rest';
  // AppData owns its own internal layout (form + AG-Grid that fills height),
  // so it must not be wrapped in a ScrollArea — that collapses the grid to 0.
  const isAppData = cfg.providerType === 'appdata';

  return (
    <div className="flex flex-col h-full min-h-0">
      {isAppData ? (
        <div className="flex-1 min-h-0">
          <Fields cfg={cfg} onChange={onCfgChange} />
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            <Fields cfg={cfg} onChange={onCfgChange} />
          </div>
        </ScrollArea>
      )}

      {showTest && (
        <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex items-center justify-between flex-shrink-0">
          <TestResultPill probe={probe} />
          <Button size="sm" variant="outline" onClick={probe.test} disabled={probe.testing} className="h-7 text-xs">
            {probe.testing ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Plug className="h-3 w-3 mr-1.5" />}
            Test Connection
          </Button>
        </div>
      )}
    </div>
  );
}

function Fields({ cfg, onChange }: { cfg: ProviderConfig; onChange(next: Partial<ProviderConfig>): void }) {
  switch (cfg.providerType) {
    case 'stomp':
      return <StompFields cfg={cfg as StompProviderConfig} onChange={onChange as (n: Partial<StompProviderConfig>) => void} />;
    case 'rest':
      return <RestFields cfg={cfg as RestProviderConfig} onChange={onChange as (n: Partial<RestProviderConfig>) => void} />;
    case 'mock':
      return <MockFields cfg={cfg as MockProviderConfig} onChange={onChange as (n: Partial<MockProviderConfig>) => void} />;
    case 'appdata':
      return <AppDataFields cfg={cfg as AppDataProviderConfig} onChange={onChange as (n: Partial<AppDataProviderConfig>) => void} />;
    default:
      return (
        <section className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          No editor for "{(cfg as AppDataProviderConfig | ProviderConfig).providerType}" providers yet.
        </section>
      );
  }
}

function TestResultPill({ probe }: { probe: ProbeState }) {
  if (probe.testing) {
    return <span className="text-xs text-muted-foreground">Connecting…</span>;
  }
  if (!probe.testResult) {
    return <span className="text-xs text-muted-foreground">Not yet tested.</span>;
  }
  if (probe.testResult.success) {
    const { rowCount } = probe.testResult;
    return (
      <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {rowCount === undefined
          ? 'Connected'
          : `Connected — received ${rowCount} row${rowCount === 1 ? '' : 's'}`}
      </span>
    );
  }
  return (
    <span className="text-xs text-destructive inline-flex items-center gap-1.5">
      <XCircle className="h-3.5 w-3.5" />
      {probe.testResult.error ?? 'connection failed'}
    </span>
  );
}
