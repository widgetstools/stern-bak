/**
 * RestFields — Connection-tab inputs for REST providers.
 */

import {
  Input, Label, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@wellsfargo-starui/react';
import type { RestProviderConfig } from '@wellsfargo-starui/types/shared';
import { KeyValueEditor } from '../KeyValueEditor.js';

export interface RestFieldsProps {
  cfg: RestProviderConfig;
  onChange(next: Partial<RestProviderConfig>): void;
}

export function RestFields({ cfg, onChange }: RestFieldsProps) {
  return (
    <div className="space-y-4">
      <Card title="Endpoint">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Method" className="col-span-1">
            <Select value={cfg.method ?? 'GET'} onValueChange={(v) => onChange({ method: v as 'GET' | 'POST' })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Base URL" required className="col-span-2">
            <Input
              className="h-8 text-sm font-mono"
              value={cfg.baseUrl ?? ''}
              onChange={(e) => onChange({ baseUrl: e.target.value })}
              placeholder="https://api.example.com"
            />
          </Field>
        </div>
        <Field label="Endpoint" required>
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.endpoint ?? ''}
            onChange={(e) => onChange({ endpoint: e.target.value })}
            placeholder="/v1/positions"
          />
        </Field>
        <Field label="Rows Path">
          <Input
            className="h-8 text-sm font-mono"
            value={cfg.rowsPath ?? ''}
            onChange={(e) => onChange({ rowsPath: e.target.value })}
            placeholder="data.results"
          />
          <Help>Dot path into the JSON response. Empty if response IS the array.</Help>
        </Field>
      </Card>

      <Card title="Payload">
        <KeyValueEditor
          label="Query Parameters"
          description="URL query string."
          value={cfg.queryParams ?? {}}
          onChange={(v) => onChange({ queryParams: v })}
          keyPlaceholder="Parameter"
          valuePlaceholder="Value"
        />
        <KeyValueEditor
          label="Custom Headers"
          description="Sent with every request."
          value={cfg.headers ?? {}}
          onChange={(v) => onChange({ headers: v })}
          keyPlaceholder="Header"
          valuePlaceholder="Value"
        />
        {cfg.method === 'POST' && (
          <Field label="Request Body (JSON)">
            <Textarea
              className="font-mono text-xs scrollbar-thin"
              rows={5}
              value={cfg.body ?? ''}
              onChange={(e) => onChange({ body: e.target.value })}
              placeholder='{"asOfDate": "{{positions.asOfDate}}"}'
            />
            <Help>Templates supported: <code className="bg-muted px-1 rounded text-[10px]">{'{{name.key}}'}</code> resolves against AppData on attach.</Help>
          </Field>
        )}
      </Card>

      <Card title="Authentication">
        <Field label="Auth Type">
          <Select
            value={cfg.auth?.type ?? 'none'}
            onValueChange={(v) => {
              if (v === 'none') onChange({ auth: undefined });
              else onChange({
                auth: {
                  type: v as 'bearer' | 'apikey' | 'basic',
                  credentials: cfg.auth?.credentials ?? '',
                  headerName: cfg.auth?.headerName,
                },
              });
            }}
          >
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="bearer">Bearer Token</SelectItem>
              <SelectItem value="apikey">API Key</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {cfg.auth && (
          <>
            <Field label="Credentials">
              <Input
                type="password"
                className="h-8 text-sm font-mono"
                value={cfg.auth.credentials ?? ''}
                onChange={(e) => onChange({ auth: { ...cfg.auth!, credentials: e.target.value } })}
              />
            </Field>
            {cfg.auth.type === 'apikey' && (
              <Field label="Header Name">
                <Input
                  className="h-8 text-sm font-mono"
                  value={cfg.auth.headerName ?? ''}
                  onChange={(e) => onChange({ auth: { ...cfg.auth!, headerName: e.target.value } })}
                  placeholder="X-API-Key"
                />
              </Field>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ─── shared layout primitives ─────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}{required ? ' *' : ''}</Label>
      {children}
    </div>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}
