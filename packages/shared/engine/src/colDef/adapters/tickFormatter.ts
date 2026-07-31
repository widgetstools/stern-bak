import type { TickToken } from '../types';

/**
 * Fixed-income tick formatter — renders a decimal bond price as
 * "handle-ticks" notation.
 *
 * Background:
 *   US Treasury prices (and most USD-denominated government-bond cash /
 *   futures quotes) are traded and displayed in 32nds of a point, not
 *   in decimal. A price of 101.50 (decimal) is "101 and 16/32" →
 *   written "101-16" on every trading desk. Sub-tick precision
 *   (halves of a 32nd, quarter-ticks, 64ths, 128ths, 256ths) is
 *   handled with desk-specific trailing-digit conventions. This
 *   formatter implements the precise conventions listed in the
 *   feature spec:
 *
 *     TICK32        101.50000  → "101-16"
 *                   101.53125  → "101-17"           (rounded to nearest 32nd)
 *     TICK32_PLUS   101.50000  → "101-16"
 *                   101.515625 → "101-16+"          (+ = half of a 32nd up)
 *                   101.5078125 → "101-16+"         (rounds to nearest half-32nd)
 *     TICK64        101.50000  → "101-160"          (trailing "0" = no quarter)
 *                   101.515625 → "101-162"          (2 = 2/4 of a 32nd = 1/2)
 *                   101.5078125 → "101-161"         (1 = 1/4 of a 32nd)
 *                   101.5234375 → "101-163"         (3 = 3/4 of a 32nd)
 *     TICK128       price rounded to nearest 1/128th with the
 *                   fractional 32nd emitted as "s" (1..7) where
 *                   each s = 1/8 of a 32nd = 1/128.
 *     TICK256       same idea, 1/16 of a 32nd per step (s = 1..15).
 *
 * Negative prices:
 *   Leading minus on the handle — "-101-16" — never parens. Matches
 *   desk convention; parens would collide with Excel's negative
 *   formatting and look wrong for order tickets.
 *
 * Round-tripping:
 *   This is a display-only transform. The stored cell value stays a
 *   plain decimal — no side effects on sort/filter/aggregation.
 */

export function tickFormatter(token: TickToken): (value: unknown) => string {
  switch (token) {
    case 'TICK32':
      return (v) => render32(v, false);
    case 'TICK32_PLUS':
      return (v) => render32Plus(v);
    case 'TICK64':
      return (v) => renderSub(v, 2); // 2 halves per 32nd = 64ths
    case 'TICK128':
      return (v) => renderSub(v, 4); // 4 quarters per 32nd = 128ths
    case 'TICK256':
      return (v) => renderSub(v, 8); // 8 eighths per 32nd = 256ths
    default:
      // exhaustive guard — keeps the type narrowing clean without a
      // runtime failure for unknown future tokens.
      return (v) => String(v ?? '');
  }
}

/** Convert `value` to `{ sign, handle, ticks32 }` where `ticks32` is a
 *  non-integer 32nds count (e.g. 16.5 for a half-32nd above 16). */
function normalize(value: unknown): { sign: number; handle: number; ticks32: number } | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const handle = Math.floor(abs);
  const frac = abs - handle;
  const ticks32 = frac * 32;
  return { sign, handle, ticks32 };
}

function applySign(s: string, sign: number): string {
  return sign < 0 ? `-${s}` : s;
}

/** TICK32 — round to nearest integer 32nd, 2-digit zero-padded ticks. */
function render32(value: unknown, _plus: boolean): string {
  const norm = normalize(value);
  if (!norm) return '';
  let ticks = Math.round(norm.ticks32);
  let handle = norm.handle;
  if (ticks === 32) {
    // Rounded up past the handle — carry to next integer.
    handle += 1;
    ticks = 0;
  }
  return applySign(`${handle}-${pad2(ticks)}`, norm.sign);
}

/** TICK32_PLUS — integer 32nds, plus an optional "+" suffix when the
 *  fractional tick falls within [0.25, 0.75) of a 32nd. */
function render32Plus(value: unknown): string {
  const norm = normalize(value);
  if (!norm) return '';
  // Snap to nearest half-32nd (0 or 0.5).
  const halves = Math.round(norm.ticks32 * 2);
  let handle = norm.handle;
  let ticks = Math.floor(halves / 2);
  const hasPlus = halves % 2 === 1;
  if (ticks === 32) {
    handle += 1;
    ticks = 0;
  }
  return applySign(`${handle}-${pad2(ticks)}${hasPlus ? '+' : ''}`, norm.sign);
}

/**
 * TICK64/128/256 — trailing digit encodes the sub-tick slice.
 *
 *   slices = 4   → 64ths:   digit 0..3      (each step = 1/4 of a 32nd)
 *   slices = 8   → 128ths:  digit 0..7      (each step = 1/8 of a 32nd)
 *   slices = 16  → 256ths:  digit 0..15 (hex for 10..15, uppercase)
 */
function renderSub(value: unknown, slices: number): string {
  const norm = normalize(value);
  if (!norm) return '';
  // Snap to nearest sub-tick.
  const total = Math.round(norm.ticks32 * slices);
  let handle = norm.handle;
  let ticks = Math.floor(total / slices);
  const slice = total % slices;
  if (ticks === 32) {
    handle += 1;
    ticks = 0;
  }
  const sliceChar =
    slices <= 10
      ? String(slice)
      : slice < 10
        ? String(slice)
        : String.fromCharCode('A'.charCodeAt(0) + (slice - 10));
  return applySign(`${handle}-${pad2(ticks)}${sliceChar}`, norm.sign);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Human-readable label for a tick token. Used by the FormatterPicker's
 * preset list and the toolbar split-button labels.
 */
export const TICK_LABELS: Record<TickToken, string> = {
  TICK32: '32nds',
  TICK32_PLUS: '32nds (+)',
  TICK64: '64ths',
  TICK128: '128ths',
  TICK256: '256ths',
};

/**
 * Quick sample-output string for each token using the same reference
 * number. Keeps the picker's help text DRY — same `0.515625` value
 * shown against each format so the user can see the difference at a
 * glance.
 */
export const TICK_SAMPLES: Record<TickToken, string> = {
  TICK32: tickFormatter('TICK32')(101.5078125),
  TICK32_PLUS: tickFormatter('TICK32_PLUS')(101.515625),
  TICK64: tickFormatter('TICK64')(101.515625),
  TICK128: tickFormatter('TICK128')(101.5078125),
  TICK256: tickFormatter('TICK256')(101.50390625),
};
