import type { PresetId, ValueFormatterTemplate } from '../types';
import type { Formatter } from './formatterTypes';
import { excelFormatter } from './excelFormatter';
import { tickFormatter } from './tickFormatter';
import {
  getExpressionPolicy,
  reportExpressionViolation,
} from '../../security/expressionPolicy';

export type { FormatterParams, Formatter } from './formatterTypes';

// ─── Preset registry ────────────────────────────────────────────────────────
//
// Each preset returns a Formatter. All are CSP-safe (Intl.* + arithmetic).
// Null/undefined value short-circuits to '' so we never render "NaN" / "null".

type PresetFactory = (opts?: Record<string, unknown>) => Formatter;

const currency: PresetFactory = (opts) => {
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: typeof opts?.currency === 'string' ? opts.currency : 'USD',
    maximumFractionDigits: typeof opts?.decimals === 'number' ? opts.decimals : 2,
    minimumFractionDigits: typeof opts?.decimals === 'number' ? opts.decimals : 2,
  });
  return ({ value }) => {
    if (value == null) return '';
    const n = Number(value);
    return Number.isFinite(n) ? fmt.format(n) : '';
  };
};

const percent: PresetFactory = (opts) => {
  const decimals = typeof opts?.decimals === 'number' ? opts.decimals : 0;
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return ({ value }) => {
    if (value == null) return '';
    const n = Number(value);
    return Number.isFinite(n) ? fmt.format(n) : '';
  };
};

const number: PresetFactory = (opts) => {
  const decimals = typeof opts?.decimals === 'number' ? opts.decimals : 0;
  const thousands = opts?.thousands !== false;
  const fmt = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: thousands,
  });
  return ({ value }) => {
    if (value == null) return '';
    const n = Number(value);
    return Number.isFinite(n) ? fmt.format(n) : '';
  };
};

/** Coerce a cell value to a Date — accepts Date, epoch-ms number, or any
 *  string `new Date` understands. Returns null when unparseable. */
function toDate(value: unknown): Date | null {
  if (value == null) return null;
  const d =
    value instanceof Date ? value
      : typeof value === 'number' ? new Date(value)
        : new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : (value as string));
  return isNaN(d.getTime()) ? null : d;
}

/** Resolve the formatting locale: explicit option wins, else the host
 *  locale, else `en-US`. */
function resolveLocale(opts?: Record<string, unknown>): string {
  if (typeof opts?.locale === 'string' && opts.locale) return opts.locale;
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'en-US';
}

const isDateStyle = (v: unknown): v is 'full' | 'long' | 'medium' | 'short' =>
  v === 'full' || v === 'long' || v === 'medium' || v === 'short';

// Localised date — honours the host (or explicit) locale. `timeZone: 'UTC'`
// is pinned deliberately: it keeps output deterministic across CI machines
// (the original reason Intl was avoided here) while still localising the
// pattern/ordering to the user's region.
const date: PresetFactory = (opts) => {
  const locale = resolveLocale(opts);
  const dateStyle = isDateStyle(opts?.dateStyle) ? opts.dateStyle : 'medium';
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle, timeZone: 'UTC' });
  return ({ value }) => {
    const d = toDate(value);
    return d ? fmt.format(d) : '';
  };
};

// Localised date + time. Same UTC pinning as `date`.
const datetime: PresetFactory = (opts) => {
  const locale = resolveLocale(opts);
  const dateStyle = isDateStyle(opts?.dateStyle) ? opts.dateStyle : 'medium';
  const timeStyle = isDateStyle(opts?.timeStyle) ? opts.timeStyle : 'short';
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle, timeStyle, timeZone: 'UTC' });
  return ({ value }) => {
    const d = toDate(value);
    return d ? fmt.format(d) : '';
  };
};

const duration: PresetFactory = () => {
  return ({ value }) => {
    if (value == null) return '';
    const ms = Number(value);
    if (!Number.isFinite(ms)) return '';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };
};

const presetRegistry: Record<PresetId, PresetFactory> = {
  currency,
  percent,
  number,
  date,
  datetime,
  duration,
};

// ─── Expression branch (CSP-unsafe; cached per expression string) ───────────

// Unbounded — fine for user-authored templates (handful per profile). Revisit
// with an LRU if expressions ever come from programmatic / less-trusted sources.
const expressionCache = new Map<string, Formatter>();

/**
 * Test-only: clear the cache between tests so cache-hit assertions are reliable.
 * @internal
 */
export function __resetExpressionCacheForTests(): void {
  expressionCache.clear();
}

function compileExpression(expression: string): Formatter {
  try {
    // eslint-disable-next-line no-new-func
    const compiled = new Function('x', 'data', `return (${expression});`) as
      (x: unknown, data?: unknown) => unknown;
    return ({ value, data }) => {
      try {
        const out = compiled(value, data);
        return out == null ? '' : String(out);
      } catch {
        // Runtime error inside the user expression — fall back to identity.
        return value == null ? '' : String(value);
      }
    };
  } catch (err) {
    console.warn(
      '[value-formatter] invalid valueFormatter expression; falling back to identity formatter:',
      expression,
      err,
    );
    return ({ value }) => (value == null ? '' : String(value));
  }
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

export function valueFormatterFromTemplate(t: ValueFormatterTemplate): Formatter {
  if (t.kind === 'preset') {
    return presetRegistry[t.preset](t.options);
  }
  if (t.kind === 'excelFormat') {
    // SSF-backed; caches by format string internally.
    return excelFormatter(t.format);
  }
  if (t.kind === 'tick') {
    // Pure function — lightweight enough to skip caching. Each call
    // returns a closure over a fixed switch branch.
    const render = tickFormatter(t.tick);
    return ({ value }) => {
      if (value == null) return '';
      return render(value);
    };
  }
  // kind: 'expression' — subject to the security policy. Strict mode
  // refuses to compile (returns an identity formatter) so deployments
  // running under a `script-src` CSP that forbids `unsafe-eval` stay
  // safe even when legacy profiles carry expression-kind templates.
  const policy = getExpressionPolicy();
  if (policy.mode === 'strict') {
    reportExpressionViolation({
      kind: 'valueFormatter',
      expression: t.expression,
      reason: 'strict-mode rejected new Function compile',
    });
    return identityFormatter;
  }
  if (policy.mode === 'warn') {
    reportExpressionViolation({
      kind: 'valueFormatter',
      expression: t.expression,
      reason: 'warn-mode observed new Function compile',
    });
  }

  let fn = expressionCache.get(t.expression);
  if (!fn) {
    fn = compileExpression(t.expression);
    expressionCache.set(t.expression, fn);
  }
  return fn;
}

const identityFormatter: Formatter = ({ value }) =>
  value == null ? '' : String(value);
