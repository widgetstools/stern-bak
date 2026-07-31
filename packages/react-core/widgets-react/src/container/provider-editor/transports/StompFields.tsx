/**
 * StompFields — Connection-tab inputs for STOMP providers.
 *
 * Grouped into two cards (Connection + Trigger) so the layout reads
 * top-to-bottom even on tall screens. All inputs are shadcn
 * primitives — no native controls. Helper text under each field
 * explains the contract against the bundled stomp-server.
 */

import { Input, Label } from '@wellsfargo-starui/ui';
import type { StompProviderConfig } from '@wellsfargo-starui/shared-types';

export interface StompFieldsProps {
  cfg: StompProviderConfig;
  onChange(next: Partial<StompProviderConfig>): void;
}

export function StompFields({ cfg, onChange }: StompFieldsProps) {
  return (
    <div className="space-y-4">
      <Card title="Connection">
        <Field label="WebSocket URL" required>
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.websocketUrl ?? ''}
            onChange={(e) => onChange({ websocketUrl: e.target.value })}
            placeholder="ws://localhost:8080"
          />
          <Help>
            Supports <code className="bg-muted px-1 rounded text-[10px]">{'{{appData.key}}'}</code> (deterministic)
            and <code className="bg-muted px-1 rounded text-[10px]">[name]</code> (session-unique ID).
          </Help>
        </Field>
        <Field label="Listener Topic" required>
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.listenerTopic ?? ''}
            onChange={(e) => onChange({ listenerTopic: e.target.value })}
            placeholder="/snapshot/positions/TRADER001"
          />
          <Help>
            The topic the worker SUBSCRIBEs to. Use <code className="bg-muted px-1 rounded text-[10px]">[name]</code> for
            a session-unique ID — same <code className="bg-muted px-1 rounded text-[10px]">[name]</code> in different fields resolve to the same value
            (e.g., <code className="bg-muted px-1 rounded text-[10px]">[clientTag]</code> here and in Trigger Body will match).
          </Help>
        </Field>
      </Card>

      <Card title="Trigger">
        <Field label="Trigger Destination">
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.requestMessage ?? ''}
            onChange={(e) => onChange({ requestMessage: e.target.value })}
            placeholder="/snapshot/positions/TRADER001/1000"
          />
          <Help>
            SEND destination after subscribing. The bundled stomp-server encodes
            <code className="bg-muted px-1 rounded mx-1 text-[10px]">.../{'{rate}'}</code>
            in the URL itself. Supports <code className="bg-muted px-1 rounded text-[10px]">[name]</code> tokens.
          </Help>
        </Field>
        <Field label="Trigger Body">
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.requestBody ?? ''}
            onChange={(e) => onChange({ requestBody: e.target.value })}
            placeholder="(empty — rate in destination)"
          />
          <Help>
            Leave empty when destination encodes everything. Some servers expect
            <code className="bg-muted px-1 rounded mx-1 text-[10px]">START</code>
            or a JSON envelope. Supports <code className="bg-muted px-1 rounded text-[10px]">[name]</code> tokens for correlation IDs
            and session-unique identifiers.
          </Help>
        </Field>
        <Field label="Snapshot End Token">
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.snapshotEndToken ?? ''}
            onChange={(e) => onChange({ snapshotEndToken: e.target.value })}
            placeholder="Success"
          />
          <Help>Case-insensitive substring that flips status: 'loading' → 'ready'.</Help>
        </Field>
      </Card>
    </div>
  );
}

// ─── shared layout primitives — kept in this file so each transport
//      can drop them in without an extra abstraction layer ──────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}{required ? ' *' : ''}
      </Label>
      {children}
    </div>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}
