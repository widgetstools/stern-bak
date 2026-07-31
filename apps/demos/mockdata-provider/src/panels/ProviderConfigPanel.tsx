import type { ReactNode } from 'react';
import {
  Button,
  Slider,
  Switch,
  RadioGroup,
  RadioGroupItem,
  Badge,
  ScrollArea,
  Separator,
} from '@wellsfargo-starui/ui';
import { useMockConfig } from '../state/MockConfigContext';
import { columnDefsByType } from '../data/columnDefsByType';
import { ConfigPreview } from '../components/ConfigPreview';
import { RotateCcw, Database } from 'lucide-react';

const ROW_COUNT_CHOICES = [50, 200, 1000] as const;

export function ProviderConfigPanel() {
  const { cfg, setDataType, setRowCount, setUpdateIntervalMs, setEnableUpdates, reset } =
    useMockConfig();
  const dataType = (cfg.dataType ?? 'positions') as 'positions' | 'trades' | 'orders';
  const { columnDefs } = columnDefsByType[dataType];

  return (
    <ScrollArea className="h-full w-full bg-[color:var(--ds-surface-ground)]">
      <div className="flex flex-col gap-5 p-4">
        <Header />

        <Section label="dataType">
          <RadioGroup
            value={dataType}
            onValueChange={(v) => setDataType(v as 'positions' | 'trades' | 'orders')}
            className="flex flex-col gap-2"
          >
            <RadioRow value="positions" label="positions" caption="~250-field bond portfolio (default)" />
            <RadioRow value="trades"    label="trades"    caption="Trade lifecycle state machine" />
            <RadioRow value="orders"    label="orders"    caption="Legacy 7-column orders" />
          </RadioGroup>
        </Section>

        <Section label="rowCount">
          <div className="flex flex-wrap gap-2">
            {ROW_COUNT_CHOICES.map((n) => (
              <Button
                key={n}
                variant={cfg.rowCount === n ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-3 font-mono text-[11px]"
                onClick={() => setRowCount(n)}
              >
                {n.toLocaleString()}
              </Button>
            ))}
          </div>
        </Section>

        <Section label={`updateIntervalMs · ${cfg.updateIntervalMs}ms`}>
          <Slider
            min={250}
            max={3000}
            step={50}
            value={[cfg.updateIntervalMs ?? 750]}
            onValueChange={([v]) => setUpdateIntervalMs(v)}
          />
        </Section>

        <Section label="enableUpdates">
          <div className="flex items-center gap-3">
            <Switch
              checked={cfg.enableUpdates ?? true}
              onCheckedChange={setEnableUpdates}
              aria-label="Stream live updates"
            />
            <Badge className="border-transparent bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-text-secondary)]">
              {cfg.enableUpdates ? 'Streaming' : 'Paused'}
            </Badge>
          </div>
        </Section>

        <Button
          variant="ghost"
          size="sm"
          className="self-start gap-1.5 text-[11px] text-[color:var(--ds-text-secondary)]"
          onClick={reset}
        >
          <RotateCcw size={12} strokeWidth={1.75} /> Reset to defaults
        </Button>

        <Separator className="bg-[color:var(--ds-border-primary)]" />

        <ConfigPreview label="MockProviderConfig" value={cfg} />
        <ConfigPreview
          label={`columnDefs (${dataType})`}
          value={columnDefs.map((c) => ({
            field: c.field,
            headerName: c.headerName,
            width: c.width,
          }))}
        />
      </div>
    </ScrollArea>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <Database size={14} strokeWidth={1.75} className="text-[color:var(--ds-accent-info)]" />
      <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-text-primary)]">
        Mock Data Provider
      </span>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ds-text-faint)]">
        {label}
      </span>
      {children}
    </section>
  );
}

function RadioRow({ value, label, caption }: { value: string; label: string; caption: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-3 py-2 transition-colors hover:bg-[color:var(--ds-surface-secondary)]">
      <RadioGroupItem value={value} className="mt-[2px]" />
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[12px] font-medium text-[color:var(--ds-text-primary)]">{label}</span>
        <span className="text-[11px] text-[color:var(--ds-text-muted)]">{caption}</span>
      </div>
    </label>
  );
}
