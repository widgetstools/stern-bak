import { memo } from 'react';
import { controls, typography } from '@wellsfargo-starui/design-system/tokens';
import {
  Band,
  IconInput,
  Mono,
  PillToggleBtn,
  PillToggleGroup,
} from '../../../ui/SettingsPanel';
import { SettingsRow } from '../../../ui/SettingsPanel/SettingsRow';
import { Switch } from '@wellsfargo-starui/react';
import type { AnimationConfig, AnimationKind, ConditionalRule } from '../state';

const DEFAULT_ANIMATION_KIND: AnimationKind = 'spin';
const DEFAULT_DURATION_MS = 1000;

const PILL_BTN_STYLE = {
  height: controls.xs.height,
  fontSize: typography.fontSize.xs,
  fontWeight: typography.fontWeight.semibold,
  letterSpacing: typography.letterSpacing.widest,
  padding: `0 ${controls.xs.paddingX}`,
  minWidth: 64,
} as const;

/**
 * AnimateBand — opt-in motion on the matching cell's *value glyph* (the
 * rendered emoji/icon from the column's value format). Pairs with the
 * Excel-format "in progress" recipe: a value format maps `1 → 🔄` and this
 * band spins it. Distinct from FLASH (which pulses the whole cell surface).
 *
 * Cell-scope only — the parent panel gates rendering on `scope.type`.
 */
export const AnimateBand = memo(function AnimateBand({
  ruleId,
  animation,
  setDraft,
}: {
  ruleId: string;
  animation: ConditionalRule['animation'];
  setDraft: (patch: Partial<ConditionalRule>) => void;
}) {
  // Carry forward existing fields when mutating one, so every control
  // writes a coherent snapshot regardless of which field it touches.
  const patchAnimation = (
    next: Partial<AnimationConfig>,
  ): AnimationConfig => ({
    enabled: animation?.enabled ?? true,
    kind: animation?.kind ?? DEFAULT_ANIMATION_KIND,
    ...(typeof animation?.durationMs === 'number' ? { durationMs: animation.durationMs } : {}),
    ...next,
  });

  const enabled = Boolean(animation?.enabled);
  const currentKind: AnimationKind = animation?.kind ?? DEFAULT_ANIMATION_KIND;

  return (
    <Band index="10" title="ANIMATE VALUE">
      <SettingsRow
        label="ANIMATE"
        hint="Spins the cell's value glyph — pair with a 🔄 / ⏳ value format for an in-progress spinner."
        control={
          <>
            <Switch
              checked={enabled}
              onCheckedChange={(on) =>
                setDraft({
                  animation: on
                    ? patchAnimation({ enabled: true })
                    : animation
                      ? { ...animation, enabled: false }
                      : undefined,
                })
              }
              data-testid={`cs-rule-animate-enabled-${ruleId}`}
            />
            <Mono color={enabled ? 'var(--ds-accent-positive)' : 'var(--ds-text-muted)'}>
              {enabled ? 'ON' : 'OFF'}
            </Mono>
          </>
        }
      />

      {enabled && (
        <>
          <SettingsRow
            label="STYLE"
            control={
              <PillToggleGroup>
                {(
                  [
                    ['spin', 'SPIN'],
                    ['spin-reverse', 'REVERSE'],
                    ['pulse', 'PULSE'],
                  ] as ReadonlyArray<[AnimationKind, string]>
                ).map(([value, label]) => (
                  <PillToggleBtn
                    key={value}
                    active={currentKind === value}
                    onClick={() => setDraft({ animation: patchAnimation({ kind: value }) })}
                    style={PILL_BTN_STYLE}
                    data-testid={`cs-rule-animate-kind-${value}-${ruleId}`}
                  >
                    {label}
                  </PillToggleBtn>
                ))}
              </PillToggleGroup>
            }
          />

          <SettingsRow
            label="SPEED"
            hint={`Full cycle · default ${DEFAULT_DURATION_MS} ms (lower = faster).`}
            noDivider
            control={
              <IconInput
                numeric
                value={typeof animation?.durationMs === 'number' ? String(animation.durationMs) : ''}
                onCommit={(raw) => {
                  const trimmed = raw.trim();
                  if (!trimmed) {
                    setDraft({ animation: patchAnimation({ durationMs: undefined }) });
                    return;
                  }
                  const n = Number(trimmed);
                  if (!Number.isFinite(n)) return;
                  setDraft({ animation: patchAnimation({ durationMs: Math.max(100, Math.round(n)) }) });
                }}
                placeholder={String(DEFAULT_DURATION_MS)}
                suffix="MS"
                className="w-[110px]"
                data-testid={`cs-rule-animate-duration-${ruleId}`}
              />
            }
          />
        </>
      )}
    </Band>
  );
});
