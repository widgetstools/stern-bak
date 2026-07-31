import { memo } from 'react';
import { CircleDot, Sliders, Target } from 'lucide-react';
import { controls, typography } from '@wellsfargo-starui/design-system/tokens';
import { Caps, IconInput, LedBar, Mono, SummaryChip } from '../../../ui/SettingsPanel';
import { Switch } from '@wellsfargo-starui/ui';
import { Select } from '../../../ui/NativeOptionsSelect';
import type { ConditionalRule, FlashTarget } from '../state';

export const RuleMetaStrip = memo(function RuleMetaStrip({
  ruleId,
  enabled,
  scopeType,
  priority,
  flash,
  appliedCount,
  setDraft,
}: {
  ruleId: string;
  enabled: boolean;
  scopeType: 'cell' | 'row';
  priority: number;
  flash: ConditionalRule['flash'];
  appliedCount: number;
  setDraft: (patch: Partial<ConditionalRule>) => void;
}) {
  const scopeLabel = scopeType === 'row' ? 'ROW' : 'CELL';

  return (
    <div className="sticky top-0 z-10 shrink-0 bg-card border-b border-border px-4 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <SummaryChip
          icon={<CircleDot size={11} strokeWidth={2} />}
          label="STATUS"
          tone={enabled ? 'positive' : 'neutral'}
          value={enabled ? 'ACTIVE' : 'MUTED'}
        />
        <SummaryChip
          icon={<Target size={11} strokeWidth={2} />}
          label="SCOPE"
          tone="info"
          value={scopeLabel}
        />
        <SummaryChip
          icon={<Sliders size={11} strokeWidth={2} />}
          label="PRIORITY"
          tone="warning"
          value={priority}
        />
        <SummaryChip
          label="APPLIED"
          value={<Mono color="var(--ds-accent-warning)">{appliedCount} ROWS</Mono>}
          tone={appliedCount > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center gap-2">
          <Caps size="2xs">STATUS</Caps>
          <LedBar on={enabled} />
          <Switch
            checked={enabled}
            onCheckedChange={(enabled) => setDraft({ enabled })}
          />
        </div>

        <div className="inline-flex items-center gap-2">
          <Caps size="2xs">SCOPE</Caps>
          <Select
            data-testid={`cs-rule-scope-${ruleId}`}
            value={scopeType}
            onChange={(e) => {
              const v = e.target.value;
              const nextScope =
                v === 'row'
                  ? { type: 'row' as const }
                  : { type: 'cell' as const, columns: [] };
              const nextFlash = flash
                ? {
                    ...flash,
                    target:
                      v === 'row'
                        ? ('row' as FlashTarget)
                        : flash.target === 'row'
                          ? ('cells' as FlashTarget)
                          : flash.target,
                  }
                : undefined;
              setDraft({ scope: nextScope, flash: nextFlash });
            }}
            style={{
              width: 88,
              height: controls.xs.height,
              fontSize: typography.fontSize.xs,
              letterSpacing: typography.letterSpacing.widest,
              textTransform: 'uppercase',
            }}
          >
            <option value="cell">CELL</option>
            <option value="row">ROW</option>
          </Select>
        </div>

        <div className="inline-flex items-center gap-2">
          <Caps size="2xs">PRIORITY</Caps>
          <IconInput
            numeric
            value={String(priority)}
            onCommit={(v) => {
              const n = Number(v);
              if (Number.isFinite(n)) {
                setDraft({ priority: Math.max(0, Math.min(100, Math.round(n))) });
              }
            }}
            data-testid={`cs-rule-priority-${ruleId}`}
            className="w-[72px]"
          />
        </div>
      </div>
    </div>
  );
});
