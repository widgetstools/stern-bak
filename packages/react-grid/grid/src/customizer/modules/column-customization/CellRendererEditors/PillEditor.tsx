/**
 * PillEditor — authoring UI for `PillRendererConfig`.
 *
 * One row per rule: exact-match value (text input) + bg colour
 * + optional fg colour. A separate "Default" row below the list
 * authors the fallback style for unmatched values. A shape
 * radio-toggles between pill (rounded) and square (slightly
 * rounded). All shadcn primitives — no native form elements.
 */
import { useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, RadioGroup, RadioGroupItem, Label } from '@wellsfargo-starui/react';
import type { PillRendererConfig, ThemeAwareColor } from '@wellsfargo-starui/design-system';
import { Row } from '../editors/Row';
import { ThemeAwareColorRow } from './themeColorRow';

export interface PillEditorProps {
  value: PillRendererConfig | undefined;
  onChange: (next: PillRendererConfig) => void;
  testId?: string;
}

const EMPTY_PILL_CONFIG: PillRendererConfig = {
  rules: [],
};

export function PillEditor({ value, onChange, testId }: PillEditorProps) {
  const cfg = value ?? EMPTY_PILL_CONFIG;

  const setRule = useCallback(
    (idx: number, patch: Partial<PillRendererConfig['rules'][number]>) => {
      const next = cfg.rules.slice();
      next[idx] = { ...next[idx]!, ...patch };
      onChange({ ...cfg, rules: next });
    },
    [cfg, onChange],
  );
  const removeRule = useCallback(
    (idx: number) => {
      const next = cfg.rules.slice();
      next.splice(idx, 1);
      onChange({ ...cfg, rules: next });
    },
    [cfg, onChange],
  );
  const addRule = useCallback(() => {
    onChange({ ...cfg, rules: [...cfg.rules, { value: '', bg: { dark: '#3b82f6', light: '#dbeafe' } }] });
  }, [cfg, onChange]);
  const setFallback = useCallback(
    (next: PillRendererConfig['fallback']) => onChange({ ...cfg, fallback: next }),
    [cfg, onChange],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Row
        label="SHAPE"
        control={
          <RadioGroup
            value={cfg.shape ?? 'pill'}
            onValueChange={(v) => onChange({ ...cfg, shape: v as 'pill' | 'square' })}
            style={{ display: 'flex', gap: 12 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RadioGroupItem value="pill" id="pill-shape-pill" data-testid={testId ? `${testId}-shape-pill` : undefined} />
              <Label htmlFor="pill-shape-pill" style={{ fontSize: 11 }}>Pill</Label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RadioGroupItem value="square" id="pill-shape-square" data-testid={testId ? `${testId}-shape-square` : undefined} />
              <Label htmlFor="pill-shape-square" style={{ fontSize: 11 }}>Square</Label>
            </div>
          </RadioGroup>
        }
      />

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', opacity: 0.7 }}>VALUE RULES</span>
          <Button size="sm" variant="outline" onClick={addRule} data-testid={testId ? `${testId}-add-rule` : undefined}>
            <Plus size={12} /> Add rule
          </Button>
        </div>
        {cfg.rules.length === 0 && (
          <div style={{ fontSize: 11, opacity: 0.6, padding: 6, border: '1px dashed var(--ds-border-primary)', borderRadius: 2 }}>
            No rules. Click <strong>Add rule</strong> to map a value to a colour.
          </div>
        )}
        {cfg.rules.map((rule, idx) => (
          <RuleRow
            key={idx}
            value={rule.value}
            bg={rule.bg}
            fg={rule.fg}
            onValueChange={(v) => setRule(idx, { value: v })}
            onBgChange={(v) => setRule(idx, { bg: v ?? { dark: '#3b82f6' } })}
            onFgChange={(v) => setRule(idx, { fg: v })}
            onRemove={() => removeRule(idx)}
            testId={testId ? `${testId}-rule-${idx}` : undefined}
          />
        ))}
      </div>

      <Row
        label="DEFAULT"
        hint="Style for unmatched values (optional)"
        control={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, opacity: 0.6, minWidth: 22 }}>BG</span>
              <ThemeAwareColorRow
                value={cfg.fallback?.bg}
                onChange={(v) => setFallback({ ...(cfg.fallback ?? {}), bg: v ?? { dark: 'rgba(127,127,127,0.2)' } })}
                testIdPrefix={testId ? `${testId}-default-bg` : undefined}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, opacity: 0.6, minWidth: 22 }}>FG</span>
              <ThemeAwareColorRow
                value={cfg.fallback?.fg}
                onChange={(v) => setFallback({ ...(cfg.fallback ?? { bg: { dark: 'rgba(127,127,127,0.2)' } }), fg: v })}
                testIdPrefix={testId ? `${testId}-default-fg` : undefined}
              />
            </div>
          </div>
        }
      />
    </div>
  );
}

function RuleRow({
  value,
  bg,
  fg,
  onValueChange,
  onBgChange,
  onFgChange,
  onRemove,
  testId,
}: {
  value: string;
  bg: ThemeAwareColor;
  fg: ThemeAwareColor | undefined;
  onValueChange: (v: string) => void;
  onBgChange: (v: ThemeAwareColor | undefined) => void;
  onFgChange: (v: ThemeAwareColor | undefined) => void;
  onRemove: () => void;
  testId?: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(80px, 140px) 1fr auto',
        gap: 8,
        alignItems: 'center',
        padding: '4px 0',
        borderBottom: '1px dashed var(--ds-border-primary)',
      }}
    >
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="exact value"
        style={{ height: 28, fontSize: 12 }}
        data-testid={testId ? `${testId}-value` : undefined}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, opacity: 0.6, minWidth: 22 }}>BG</span>
          <ThemeAwareColorRow value={bg} onChange={(v) => onBgChange(v)} testIdPrefix={testId ? `${testId}-bg` : undefined} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, opacity: 0.6, minWidth: 22 }}>FG</span>
          <ThemeAwareColorRow value={fg} onChange={onFgChange} testIdPrefix={testId ? `${testId}-fg` : undefined} />
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onRemove}
        aria-label="Remove rule"
        data-testid={testId ? `${testId}-remove` : undefined}
      >
        <Trash2 size={12} />
      </Button>
    </div>
  );
}
