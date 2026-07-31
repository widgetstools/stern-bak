/**
 * Legacy-payload normaliser for `conditional-styling`'s `deserialize`.
 *
 * Profiles persisted by older schema versions reach the live module via
 * `deserialize(raw)`. Three legacy shapes need active rewriting:
 *
 *  1. `flash.flashDuration` + `flash.fadeDuration` (the old two-knob
 *     model) → coalesced into `flash.durationMs`.
 *  2. Loose `flash.target` / `mode` / `color` values → clamped to the
 *     current enum sets (scope-aware: row rules can only target 'row').
 *  3. `indicator.target` / `position` → clamped; missing icon drops the
 *     whole indicator block.
 *
 * Plus shape validation for `valueFormatter.kind` and `activeDurationMs`.
 * Anything unrecognisable is dropped silently — the runtime guarantees
 * its predicates never receive partial structures.
 */

import { normalizeDuration } from './runtime/utils';
import type {
  ConditionalStylingState,
  FlashColor,
  FlashConfig,
  FlashMode,
} from './state';

const FLASH_COLOR_NAMES: readonly FlashColor[] = [
  'amber',
  'emerald',
  'rose',
  'sky',
  'violet',
  'teal',
  'orange',
  'slate',
] as const;

export function deserializeConditionalStylingState(raw: unknown): ConditionalStylingState {
  if (!raw || typeof raw !== 'object') return { rules: [] };
  const d = raw as Partial<ConditionalStylingState>;
  const rules = Array.isArray(d.rules) ? d.rules : [];
  return {
    rules: rules.map((r) => {
      let next = r;
      if (r.flash) {
        const flashRaw = r.flash as Partial<FlashConfig> & {
          flashDuration?: unknown;
          fadeDuration?: unknown;
        };
        const { enabled, target, mode, color, durationMs } = flashRaw;
        const scope = r.scope?.type ?? 'cell';
        const allowed: Record<string, true> = scope === 'row'
          ? { row: true }
          : { cells: true, headers: true, 'cells+headers': true };
        const normalizedTarget = allowed[target as string] ? target : scope === 'row' ? 'row' : 'cells';
        // Legacy migration: pre-mode payloads carried `flashDuration` +
        // `fadeDuration` (AG-Grid's native two-knob shape, which we never
        // actually applied). Sum them into a single `durationMs` so old
        // profiles keep a roughly-equivalent visible window.
        let migratedDurationMs: number | undefined;
        if (typeof durationMs === 'number' && durationMs > 0) {
          migratedDurationMs = Math.round(durationMs);
        } else {
          const fd = typeof flashRaw.flashDuration === 'number' ? flashRaw.flashDuration : 0;
          const fade = typeof flashRaw.fadeDuration === 'number' ? flashRaw.fadeDuration : 0;
          const sum = fd + fade;
          if (sum > 0) migratedDurationMs = Math.round(sum);
        }
        const normalizedMode: FlashMode = mode === 'pulse' ? 'pulse' : 'oneShot';
        const normalizedColor: FlashColor = FLASH_COLOR_NAMES.includes(color as FlashColor)
          ? (color as FlashColor)
          : 'amber';
        next = {
          ...next,
          flash: {
            enabled: Boolean(enabled),
            target: normalizedTarget as FlashConfig['target'],
            mode: normalizedMode,
            color: normalizedColor,
            ...(typeof migratedDurationMs === 'number' ? { durationMs: migratedDurationMs } : {}),
          },
        };
      }
      if (r.indicator && typeof r.indicator === 'object') {
        const { icon, color, target, position } = r.indicator;
        if (typeof icon === 'string' && icon.length > 0) {
          const normalizedTarget: 'cells' | 'headers' | 'cells+headers' =
            target === 'cells' || target === 'headers' || target === 'cells+headers' ? target : 'cells+headers';
          const normalizedPosition:
            | 'top-left'
            | 'top-right'
            | 'bottom-left'
            | 'bottom-right'
            | 'left-middle'
            | 'right-middle' =
            position === 'top-left' ||
            position === 'top-right' ||
            position === 'bottom-left' ||
            position === 'bottom-right' ||
            position === 'left-middle' ||
            position === 'right-middle'
              ? position
              : 'top-right';
          next = {
            ...next,
            indicator: {
              icon,
              target: normalizedTarget,
              position: normalizedPosition,
              ...(typeof color === 'string' && color.length > 0 ? { color } : {}),
            },
          };
        } else {
          const { indicator: _drop, ...rest } = next;
          void _drop;
          next = rest;
        }
      }
      if (r.valueFormatter && typeof r.valueFormatter === 'object') {
        const v = r.valueFormatter as { kind?: string };
        const ok = v.kind === 'preset' || v.kind === 'excelFormat' || v.kind === 'expression' || v.kind === 'tick';
        if (!ok) {
          const { valueFormatter: _drop, ...rest } = next;
          void _drop;
          next = rest;
        }
      }
      if (typeof r.activeDurationMs === 'number') {
        const normalized = normalizeDuration(r.activeDurationMs);
        if (normalized != null) next = { ...next, activeDurationMs: normalized };
        else {
          const { activeDurationMs: _drop, ...rest } = next;
          void _drop;
          next = rest;
        }
      }
      return next;
    }),
  };
}
