import { memo } from 'react';
import { controls, radius, spacing, typography } from '@wellsfargo-starui/design-system/tokens';
import {
  Band,
  Caps,
  IconInput,
  Mono,
  PillToggleBtn,
  PillToggleGroup,
} from '../../../ui/SettingsPanel';
import { ChromeButton } from '../../../ui/ChromeButton';
import { SettingsRow } from '../../../ui/SettingsPanel/SettingsRow';
import { Switch } from '@wellsfargo-starui/react';
import type {
  ConditionalRule,
  FlashColor,
  FlashMode,
  FlashTarget,
} from '../state';
import { FLASH_PALETTE } from '../transforms';

const FLASH_COLOR_ORDER: ReadonlyArray<FlashColor> = [
  'amber',
  'emerald',
  'rose',
  'sky',
  'violet',
  'teal',
  'orange',
  'slate',
];

const DEFAULT_FLASH_COLOR: FlashColor = 'amber';
const DEFAULT_FLASH_MODE: FlashMode = 'oneShot';
const DEFAULT_DURATION_MS = 700;

const PILL_BTN_STYLE = {
  height: controls.xs.height,
  fontSize: typography.fontSize.xs,
  fontWeight: typography.fontWeight.semibold,
  letterSpacing: typography.letterSpacing.widest,
  padding: `0 ${controls.xs.paddingX}`,
  minWidth: 56,
} as const;

// Color-swatch dimensions intentionally match the xs control tier so
// the swatches sit flush with the adjacent pill toggles on the same row.
const SWATCH_SIZE = controls.xs.height;
const SWATCH_MIN_LABEL_WIDTH = 72;

export const FlashBand = memo(function FlashBand({
  ruleId,
  flash,
  activeDurationMs,
  scopeType,
  setDraft,
}: {
  ruleId: string;
  flash: ConditionalRule['flash'];
  activeDurationMs: number | undefined;
  scopeType: 'cell' | 'row';
  setDraft: (patch: Partial<ConditionalRule>) => void;
}) {
  // Carry forward existing flash fields when mutating one. Centralised
  // so every editor control writes a coherent snapshot regardless of
  // which field it touches.
  const patchFlash = (
    next: Partial<NonNullable<ConditionalRule['flash']>>,
  ): NonNullable<ConditionalRule['flash']> => ({
    enabled: flash?.enabled ?? true,
    target: flash?.target ?? (scopeType === 'row' ? 'row' : 'cells'),
    mode: flash?.mode ?? DEFAULT_FLASH_MODE,
    color: flash?.color ?? DEFAULT_FLASH_COLOR,
    ...(typeof flash?.durationMs === 'number' ? { durationMs: flash.durationMs } : {}),
    ...next,
  });

  const enabled = Boolean(flash?.enabled);
  const currentColor: FlashColor = flash?.color ?? DEFAULT_FLASH_COLOR;
  const currentMode: FlashMode = flash?.mode ?? DEFAULT_FLASH_MODE;

  return (
    <Band index="07" title="FLASH ON MATCH">
      {/* Row 1: enable switch + target — always visible so users can
          turn flash on without first scrolling */}
      <SettingsRow
        label="FLASH"
        control={
          <>
            <Switch
              checked={enabled}
              onCheckedChange={(on) => {
                if (!on) {
                  setDraft({ flash: flash ? { ...flash, enabled: false } : undefined });
                  return;
                }
                const defaultTarget: FlashTarget = scopeType === 'row' ? 'row' : 'cells';
                setDraft({
                  flash: patchFlash({ enabled: true, target: flash?.target ?? defaultTarget }),
                });
              }}
              data-testid={`cs-rule-flash-enabled-${ruleId}`}
            />
            <Mono color={enabled ? 'var(--ds-accent-positive)' : 'var(--ds-text-muted)'}>
              {enabled ? 'ON' : 'OFF'}
            </Mono>
            {enabled && scopeType === 'cell' && (
              <PillToggleGroup style={{ marginLeft: spacing[3] }}>
                {(
                  [
                    ['cells', 'CELLS'],
                    ['headers', 'HEADERS'],
                    ['cells+headers', 'BOTH'],
                  ] as ReadonlyArray<[FlashTarget, string]>
                ).map(([value, label]) => (
                  <PillToggleBtn
                    key={value}
                    active={flash?.target === value}
                    onClick={() => setDraft({ flash: patchFlash({ target: value }) })}
                    style={PILL_BTN_STYLE}
                    data-testid={`cs-rule-flash-target-${value}-${ruleId}`}
                  >
                    {label}
                  </PillToggleBtn>
                ))}
              </PillToggleGroup>
            )}
            {enabled && scopeType === 'row' && (
              <Caps size="xs" color="var(--ds-text-muted)" style={{ marginLeft: spacing[3] }}>
                ENTIRE ROW
              </Caps>
            )}
          </>
        }
      />

      {enabled && (
        <>
          {/* Row 2: mode pills */}
          <SettingsRow
            label="MODE"
            hint={
              currentMode === 'pulse'
                ? 'Continuous — use sparingly at scale.'
                : 'Single fade on each match.'
            }
            control={
              <PillToggleGroup>
                {(
                  [
                    ['oneShot', 'ONE SHOT'],
                    ['pulse', 'PULSE'],
                  ] as ReadonlyArray<[FlashMode, string]>
                ).map(([value, label]) => (
                  <PillToggleBtn
                    key={value}
                    active={currentMode === value}
                    onClick={() => setDraft({ flash: patchFlash({ mode: value }) })}
                    style={{ ...PILL_BTN_STYLE, minWidth: SWATCH_MIN_LABEL_WIDTH }}
                    data-testid={`cs-rule-flash-mode-${value}-${ruleId}`}
                  >
                    {label}
                  </PillToggleBtn>
                ))}
              </PillToggleGroup>
            }
          />

          {/* Row 3: colour swatches + duration on the same line — they're
              related (both shape the visible flash) and pairing them
              keeps the band compact without sacrificing scannability */}
          <SettingsRow
            label="COLOR"
            control={
              <div
                role="radiogroup"
                aria-label="Flash colour"
                style={{ display: 'inline-flex', gap: spacing[1.5], alignItems: 'center' }}
              >
                {FLASH_COLOR_ORDER.map((name) => {
                  const isActive = currentColor === name;
                  return (
                    <ChromeButton
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setDraft({ flash: patchFlash({ color: name }) })}
                      title={name.charAt(0).toUpperCase() + name.slice(1)}
                      aria-label={`Flash colour ${name}`}
                      data-testid={`cs-rule-flash-color-${name}-${ruleId}`}
                      style={{
                        // Fixed visual box so the active outline doesn't
                        // shift layout — outline lives OUTSIDE the box
                        // border via box-shadow, which doesn't take
                        // layout space.
                        width: SWATCH_SIZE,
                        height: SWATCH_SIZE,
                        borderRadius: radius.xl,
                        padding: 0,
                        background: FLASH_PALETTE[name].swatch,
                        border: '1px solid var(--ds-border-secondary)',
                        boxShadow: isActive
                          ? '0 0 0 2px var(--ds-surface-primary), 0 0 0 4px var(--ds-accent-positive)'
                          : 'inset 0 0 0 1px var(--ds-border-primary)',
                        cursor: 'pointer',
                        outline: 'none',
                        transition: 'transform 100ms ease-out, box-shadow 100ms ease-out',
                        transform: isActive ? 'scale(1.06)' : 'scale(1)',
                      }}
                      onFocus={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.boxShadow =
                            'inset 0 0 0 1px var(--ds-border-primary), 0 0 0 2px var(--ds-accent-positive)';
                        }
                      }}
                      onBlur={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.boxShadow =
                            'inset 0 0 0 1px var(--ds-border-primary)';
                        }
                      }}
                    />
                  );
                })}
              </div>
            }
          />

          <SettingsRow
            label="DURATION"
            hint={`Full cycle · default ${DEFAULT_DURATION_MS} ms.`}
            control={
              <IconInput
                numeric
                value={typeof flash?.durationMs === 'number' ? String(flash.durationMs) : ''}
                onCommit={(raw) => {
                  const trimmed = raw.trim();
                  if (!trimmed) {
                    setDraft({ flash: patchFlash({ durationMs: undefined }) });
                    return;
                  }
                  const n = Number(trimmed);
                  if (!Number.isFinite(n)) return;
                  setDraft({ flash: patchFlash({ durationMs: Math.max(50, Math.round(n)) }) });
                }}
                placeholder={String(DEFAULT_DURATION_MS)}
                suffix="MS"
                className="w-[110px]"
                data-testid={`cs-rule-flash-duration-${ruleId}`}
              />
            }
          />
        </>
      )}

      {/* Style window is a related-but-distinct concept (covers ALL
          rule styling, not just the flash), so keep it as its own row
          at the bottom with a hint that disambiguates it. */}
      <SettingsRow
        label="STYLE WINDOW"
        hint="Optional — match styling auto-reverts after this interval. Leave blank for persistent."
        noDivider
        control={
          <IconInput
            numeric
            value={typeof activeDurationMs === 'number' ? String(activeDurationMs) : ''}
            onCommit={(raw) => {
              const trimmed = raw.trim();
              if (!trimmed) {
                setDraft({ activeDurationMs: undefined });
                return;
              }
              const next = Number(trimmed);
              if (!Number.isFinite(next)) return;
              setDraft({ activeDurationMs: Math.max(1, Math.round(next)) });
            }}
            placeholder="Persistent"
            suffix="MS"
            className="w-[130px]"
            data-testid={`cs-rule-style-window-ms-${ruleId}`}
          />
        }
      />
    </Band>
  );
});
