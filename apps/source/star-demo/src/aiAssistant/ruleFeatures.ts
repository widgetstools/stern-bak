/**
 * Validation for the *rich* parts of a conditional-styling rule — flash,
 * indicator badge, glyph animation and the timed "active window".
 *
 * These live as TOP-LEVEL properties on `ConditionalRule` (not inside
 * `style`), which is exactly where a model tends to get it wrong. Rather
 * than let a malformed rule reach the profile — where it silently paints
 * nothing — every field is checked here and failures come back as a tool
 * result the model can read and repair.
 *
 * The catalogs mirror `@wellsfargo-starui/core`, whose runtime renders them.
 * They are copied rather than imported ON PURPOSE: importing the value
 * `INDICATOR_ICONS` pulls the whole customizer engine into this window's
 * bundle, and the AI Assistant runs standalone with no grid mounted (it also
 * took the unit suite from 3s to 67s). `ruleFeatures.test.ts` imports the
 * real catalog and asserts these lists match it, so drift fails a test
 * instead of reaching a user. Types are import-only — erased at runtime.
 */
import type {
  AnimationConfig,
  AnimationKind,
  FlashColor,
  FlashConfig,
  FlashMode,
  FlashTarget,
  IndicatorPosition,
  IndicatorTarget,
  RuleIndicator,
  RuleScope,
} from '@wellsfargo-starui/core';

/** The `direction` group — what a tick/up-down rule wants. */
export const DIRECTION_ICON_KEYS = [
  'arrow-up',
  'arrow-down',
  'trending-up',
  'trending-down',
  'chevrons-up',
  'chevrons-down',
  'triangle-up-solid',
  'triangle-down-solid',
  'corner-triangle-top-right-solid',
  'corner-triangle-top-left-solid',
  'corner-triangle-bottom-right-solid',
  'corner-triangle-bottom-left-solid',
] as const;

export const INDICATOR_ICON_KEYS = [
  ...DIRECTION_ICON_KEYS,
  // alert
  'alert-triangle', 'alert-circle', 'alert-octagon', 'zap', 'zap-solid', 'flame', 'flame-solid',
  'bell', 'bell-solid', 'alert-triangle-solid', 'alert-circle-solid', 'alert-octagon-solid',
  // status
  'circle-dot', 'circle-dot-solid', 'flag', 'flag-solid', 'pin', 'pin-solid', 'bookmark', 'bookmark-solid',
  // lifecycle
  'check-circle', 'x-circle', 'clock', 'lock',
  // favorite
  'star', 'star-solid', 'eye', 'eye-solid', 'target', 'target-solid', 'sparkles', 'sparkles-solid',
  // classification
  'tag', 'info',
] as const;

export const FLASH_COLORS = ['amber', 'emerald', 'rose', 'sky', 'violet', 'teal', 'orange', 'slate'] as const;
export const FLASH_MODES = ['oneShot', 'pulse'] as const;
export const FLASH_TARGETS = ['row', 'cells', 'headers', 'cells+headers'] as const;
export const INDICATOR_TARGETS = ['cells', 'headers', 'cells+headers'] as const;
export const INDICATOR_POSITIONS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'left-middle',
  'right-middle',
] as const;
export const ANIMATION_KINDS = ['spin', 'spin-reverse', 'pulse'] as const;

export interface RuleFeatures {
  flash?: FlashConfig;
  indicator?: RuleIndicator;
  animation?: AnimationConfig;
  activeDurationMs?: number;
}

export type RuleFeatureResult = { ok: true; features: RuleFeatures } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): { ok: true; value: T | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return { ok: true, value: value as T };
  }
  return { ok: false, error: `${field} must be one of: ${allowed.join(', ')}. Got ${JSON.stringify(value)}.` };
}

function positiveMs(value: unknown, field: string): { ok: true; value: number | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return { ok: false, error: `${field} must be a positive number of milliseconds. Got ${JSON.stringify(value)}.` };
  }
  return { ok: true, value: Math.round(value) };
}

/**
 * `flash.target` is constrained by the rule's scope: a row rule can only
 * flash the row, a cell rule can't flash "row". Validated here so the model
 * gets told, instead of the runtime quietly substituting a default.
 */
function defaultFlashTarget(scope: RuleScope | undefined): FlashTarget {
  return scope?.type === 'row' ? 'row' : 'cells';
}

function normalizeFlash(raw: unknown, scope: RuleScope | undefined): { ok: true; value: FlashConfig } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: 'flash must be an object, e.g. { "enabled": true, "color": "emerald", "durationMs": 700 }.' };

  const target = oneOf<FlashTarget>(raw.target, FLASH_TARGETS, 'flash.target');
  if (!target.ok) return target;
  const mode = oneOf<FlashMode>(raw.mode, FLASH_MODES, 'flash.mode');
  if (!mode.ok) return mode;
  const color = oneOf<FlashColor>(raw.color, FLASH_COLORS, 'flash.color');
  if (!color.ok) return color;
  const durationMs = positiveMs(raw.durationMs, 'flash.durationMs');
  if (!durationMs.ok) return durationMs;

  const resolvedTarget = target.value ?? defaultFlashTarget(scope);
  if (scope?.type === 'row' && resolvedTarget !== 'row') {
    return { ok: false, error: 'A row-scope rule can only use flash.target "row".' };
  }
  if (scope?.type === 'cell' && resolvedTarget === 'row') {
    return { ok: false, error: 'flash.target "row" needs a row-scope rule. Use "cells", "headers" or "cells+headers".' };
  }
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
    return { ok: false, error: 'flash.enabled must be a boolean.' };
  }

  const flash: FlashConfig = { enabled: (raw.enabled as boolean | undefined) ?? true, target: resolvedTarget };
  if (mode.value) flash.mode = mode.value;
  if (color.value) flash.color = color.value;
  if (durationMs.value) flash.durationMs = durationMs.value;
  return { ok: true, value: flash };
}

function normalizeIndicator(raw: unknown): { ok: true; value: RuleIndicator } | { ok: false; error: string } {
  if (!isRecord(raw)) {
    return { ok: false, error: 'indicator must be an object, e.g. { "icon": "arrow-up", "color": "#16a34a" }.' };
  }
  if (typeof raw.icon !== 'string' || !(INDICATOR_ICON_KEYS as readonly string[]).includes(raw.icon)) {
    return {
      ok: false,
      error:
        `indicator.icon ${JSON.stringify(raw.icon)} is not a known icon. Direction icons: ${DIRECTION_ICON_KEYS.join(', ')}. ` +
        `Full list: ${INDICATOR_ICON_KEYS.join(', ')}.`,
    };
  }
  const target = oneOf<IndicatorTarget>(raw.target, INDICATOR_TARGETS, 'indicator.target');
  if (!target.ok) return target;
  const position = oneOf<IndicatorPosition>(raw.position, INDICATOR_POSITIONS, 'indicator.position');
  if (!position.ok) return position;
  if (raw.color !== undefined && typeof raw.color !== 'string') {
    return { ok: false, error: 'indicator.color must be a CSS colour string, e.g. "#16a34a".' };
  }

  const indicator: RuleIndicator = { icon: raw.icon };
  if (raw.color !== undefined) indicator.color = raw.color as string;
  if (target.value) indicator.target = target.value;
  if (position.value) indicator.position = position.value;
  return { ok: true, value: indicator };
}

function normalizeAnimation(raw: unknown): { ok: true; value: AnimationConfig } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: 'animation must be an object, e.g. { "enabled": true, "kind": "spin" }.' };
  const kind = oneOf<AnimationKind>(raw.kind, ANIMATION_KINDS, 'animation.kind');
  if (!kind.ok) return kind;
  const durationMs = positiveMs(raw.durationMs, 'animation.durationMs');
  if (!durationMs.ok) return durationMs;
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
    return { ok: false, error: 'animation.enabled must be a boolean.' };
  }
  const animation: AnimationConfig = { enabled: (raw.enabled as boolean | undefined) ?? true };
  if (kind.value) animation.kind = kind.value;
  if (durationMs.value) animation.durationMs = durationMs.value;
  return { ok: true, value: animation };
}

/**
 * Picks the rich fields out of a tool-call argument bag. Absent fields stay
 * absent (so an update patch only touches what was supplied); present but
 * malformed fields fail the whole call with a repairable message.
 */
export function normalizeRuleFeatures(
  args: Record<string, unknown>,
  scope: RuleScope | undefined,
): RuleFeatureResult {
  const features: RuleFeatures = {};

  if (args.flash !== undefined) {
    const flash = normalizeFlash(args.flash, scope);
    if (!flash.ok) return flash;
    features.flash = flash.value;
  }
  if (args.indicator !== undefined) {
    const indicator = normalizeIndicator(args.indicator);
    if (!indicator.ok) return indicator;
    features.indicator = indicator.value;
  }
  if (args.animation !== undefined) {
    const animation = normalizeAnimation(args.animation);
    if (!animation.ok) return animation;
    features.animation = animation.value;
  }
  if (args.activeDurationMs !== undefined) {
    const ms = positiveMs(args.activeDurationMs, 'activeDurationMs');
    if (!ms.ok) return ms;
    features.activeDurationMs = ms.value;
  }

  return { ok: true, features };
}
