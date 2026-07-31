// ─────────────────────────────────────────────────────────────
//  FI Design System — Vanilla TS AG Grid Cell Renderers
//  Framework-agnostic, works in both React and Angular.
//  Uses ICellRendererComp interface (init + getGui).
//
//  All badge tints reference CSS variables defined in the theme
//  (fi-dark.css / fi-light.css) so renderers automatically adapt
//  when the user switches themes. No hardcoded rgba values.
//
//  The "configurable" renderers below (PillCellRenderer, …) read
//  their config from `params.cellRendererParams`, exposed by AG
//  Grid as additional fields on the `init(params)` argument.
//  Per-user-picked colours come through as `ThemeAwareColor`
//  pairs; a per-renderer MutationObserver on `<html data-theme>`
//  re-paints the cell when the host flips theme.
// ─────────────────────────────────────────────────────────────

import type { ICellRendererComp, ICellRendererParams } from 'ag-grid-community';
import type {
  AllocationBarRendererConfig,
  CountryFlagRendererConfig,
  HeatmapRendererConfig,
  IconTextRendererConfig,
  MultiLineRendererConfig,
  PercentBarRendererConfig,
  PillRendererConfig,
  RatingDeltaRendererConfig,
  SparklineRendererConfig,
  ThemeAwareColor,
  TimeSinceRendererConfig,
  TrendArrowRendererConfig,
} from './cellRendererRegistry';

// ── Helper ──
function el(tag: string, styles: Record<string, string>, text?: string): HTMLElement {
  const e = document.createElement(tag);
  Object.assign(e.style, styles);
  if (text !== undefined) e.textContent = text;
  return e;
}

const MONO = "'JetBrains Mono', monospace";

// ── Side (BUY / SELL) ──
export class SideCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const isBuy = params.value === 'Buy' || params.value === 'B';
    this.eGui = el('span', {
      fontSize: '10px', fontWeight: '700', letterSpacing: '0.05em',
      fontFamily: MONO,
      color: isBuy ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)',
    }, isBuy ? 'BUY' : 'SELL');
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── Status Badge (Filled / Partial / Pending / Cancelled) ──
// Backgrounds/borders reference overlay tokens so both themes work.
const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  Filled:    { bg: 'var(--ds-overlay-positive-soft)', color: 'var(--ds-accent-positive)', border: 'var(--ds-overlay-positive-ring)' },
  Partial:   { bg: 'var(--ds-overlay-warning-soft)',  color: 'var(--ds-accent-warning)',  border: 'var(--ds-overlay-warning-ring)'  },
  Pending:   { bg: 'var(--ds-overlay-info-soft)',     color: 'var(--ds-accent-info)',     border: 'var(--ds-overlay-info-ring)'     },
  Cancelled: { bg: 'var(--ds-overlay-negative-soft)', color: 'var(--ds-accent-negative)', border: 'var(--ds-overlay-negative-ring)' },
  Working:   { bg: 'var(--ds-overlay-info-soft)',     color: 'var(--ds-accent-info)',     border: 'var(--ds-overlay-info-ring)'     },
};

export class StatusBadgeRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const s = STATUS_STYLES[params.value] || STATUS_STYLES['Pending'];
    this.eGui = el('span', {
      fontFamily: MONO, fontSize: '10px', padding: '1px 6px', borderRadius: '2px',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }, params.value);
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── Colored Value (positive/negative or threshold-based) ──
export class ColoredValueRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const v = Number(params.value);
    const color = v >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)';
    const prefix = v > 0 ? '+' : '';
    this.eGui = el('span', { fontFamily: MONO, color }, `${prefix}${params.valueFormatted || params.value}`);
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── OAS Value (threshold: >80 = warning, else positive) ──
export class OasValueRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const v = Number(params.value);
    const color = v > 80 ? 'var(--ds-accent-warning)' : 'var(--ds-accent-positive)';
    this.eGui = el('span', { fontFamily: MONO, color }, v > 0 ? `+${v}` : String(v));
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── Signed Spread (always show +/-) ──
export class SignedValueRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const v = Number(params.value);
    const prefix = v > 0 ? '+' : '';
    this.eGui = el('span', { fontFamily: MONO, color: 'var(--ds-text-secondary)' }, `${prefix}${params.valueFormatted || params.value}`);
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── Ticker (cyan, bold) ──
export class TickerCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    this.eGui = el('span', {
      fontFamily: MONO, fontWeight: '700', fontSize: '11px',
      color: 'var(--ds-accent-highlight)',
    }, params.value);
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── Rating Badge (Aaa, Aa1, A2, Baa1, Ba2 etc.) ──
// aaa/aa → positive, a → positive (slightly softer), bbb → warning, hy → negative.
const RTG_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  aaa: { bg: 'var(--ds-overlay-positive-soft)', color: 'var(--ds-accent-positive)', border: 'var(--ds-overlay-positive-ring)' },
  aa:  { bg: 'var(--ds-overlay-positive-soft)', color: 'var(--ds-accent-positive)', border: 'var(--ds-overlay-positive-ring)' },
  a:   { bg: 'var(--ds-overlay-info-soft)',     color: 'var(--ds-accent-info)',     border: 'var(--ds-overlay-info-ring)'     },
  bbb: { bg: 'var(--ds-overlay-warning-soft)',  color: 'var(--ds-accent-warning)',  border: 'var(--ds-overlay-warning-ring)'  },
  hy:  { bg: 'var(--ds-overlay-negative-soft)', color: 'var(--ds-accent-negative)', border: 'var(--ds-overlay-negative-ring)' },
};

export class RatingBadgeRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const rtgClass = params.data?.rtgClass || 'bbb';
    const s = RTG_STYLES[rtgClass] || RTG_STYLES['bbb'];
    this.eGui = el('span', {
      fontFamily: MONO, fontSize: '10px', fontWeight: '700', letterSpacing: '0.04em',
      padding: '1px 6px', borderRadius: '2px',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }, params.value);
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── P&L Value (green for positive, red for negative, with K suffix) ──
export class PnlValueRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const v = Number(params.value);
    const color = v >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)';
    this.eGui = el('span', { fontFamily: MONO, color }, `${v >= 0 ? '+' : ''}${v}K`);
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── Filled Amount (green if fully filled, amber if partial) ──
export class FilledAmountRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const filled = params.value;
    const qty = params.data?.qty;
    const color = filled === qty ? 'var(--ds-accent-positive)' : 'var(--ds-accent-warning)';
    this.eGui = el('span', { fontFamily: MONO, color }, String(filled));
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── Book Name (cyan colored) ──
export class BookNameRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    this.eGui = el('span', { fontFamily: MONO, color: 'var(--ds-accent-highlight)' }, params.value);
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── Change Value for market indices (green/red based on sign) ──
export class ChangeValueRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const v = Number(params.value);
    const color = v >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)';
    const prefix = v >= 0 ? '+' : '';
    this.eGui = el('span', { fontFamily: MONO, color }, `${prefix}${v.toFixed(2)}`);
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── YTD renderer (parses string for +/- to determine color) ──
export class YtdValueRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const isPositive = String(params.value).startsWith('+');
    const color = isPositive ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)';
    this.eGui = el('span', { fontFamily: MONO, color }, params.value);
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── RFQ Status (LIVE / DONE / STALE) ──
const RFQ_STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  live:  { bg: 'var(--ds-overlay-info-soft)',     color: 'var(--ds-accent-info)',    border: 'var(--ds-overlay-info-ring)'     },
  done:  { bg: 'var(--ds-overlay-positive-soft)', color: 'var(--ds-accent-positive)', border: 'var(--ds-overlay-positive-ring)' },
  stale: { bg: 'var(--ds-overlay-neutral-soft)',  color: 'var(--ds-text-muted)',     border: 'var(--ds-overlay-neutral-ring)'  },
};

export class RfqStatusRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const status = params.value || 'live';
    const s = RFQ_STATUS_STYLES[status] || RFQ_STATUS_STYLES['live'];
    this.eGui = el('span', {
      fontFamily: MONO, fontSize: '10px', padding: '1px 6px', borderRadius: '2px',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }, status.toUpperCase());
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ═══════════════════════════════════════════════════════════════
//  Configurable renderers (Tier 1 + 2 + FI specialised)
//
//  Each reads its config from the `params` object — AG Grid spreads
//  `colDef.cellRendererParams` onto the standard ICellRendererParams
//  shape at runtime. Theme-aware colour fields are resolved by
//  reading `<html data-theme>` and watched via a MutationObserver
//  so a theme flip re-paints without an external `refreshCells`.
// ═══════════════════════════════════════════════════════════════

type ThemeMode = 'dark' | 'light';

function readThemeMode(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function pickThemeColor(c: ThemeAwareColor | undefined, mode: ThemeMode): string {
  if (!c) return '';
  return c[mode] ?? c.dark ?? c.light ?? '';
}

/**
 * Watch `<html data-theme>` for changes and invoke `onChange` with
 * the new mode. Returns a disposer; callers store it and invoke
 * from `destroy()` so the subscription doesn't outlive the cell.
 *
 * ONE MutationObserver for the whole module — the old shape created
 * one per cell instance, so a 52-column blotter with a handful of
 * themed renderer columns ran thousands of observers all watching the
 * same `<html data-theme>` attribute. Subscribers register in a Set;
 * the observer disconnects when the last cell unsubscribes.
 */
const themeSubscribers = new Set<(mode: ThemeMode) => void>();
let themeObserver: MutationObserver | null = null;

function watchThemeMode(onChange: (mode: ThemeMode) => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => {
      const mode = readThemeMode();
      for (const cb of themeSubscribers) {
        try { cb(mode); } catch { /* one broken cell must not break the rest */ }
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }
  themeSubscribers.add(onChange);
  return () => {
    themeSubscribers.delete(onChange);
    if (themeSubscribers.size === 0 && themeObserver) {
      themeObserver.disconnect();
      themeObserver = null;
    }
  };
}

/** Linearly interpolate between two #rrggbb hex colours by t in [0, 1]. */
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a || b || '';
  const tt = Math.max(0, Math.min(1, t));
  const r = Math.round(pa.r + (pb.r - pa.r) * tt);
  const g = Math.round(pa.g + (pb.g - pa.g) * tt);
  const b2 = Math.round(pa.b + (pb.b - pa.b) * tt);
  return `rgb(${r}, ${g}, ${b2})`;
}

function parseHex(s: string): { r: number; g: number; b: number } | null {
  const m = s.replace('#', '').trim();
  if (m.length === 3) {
    const r = parseInt(m[0]! + m[0]!, 16);
    const g = parseInt(m[1]! + m[1]!, 16);
    const b = parseInt(m[2]! + m[2]!, 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  if (m.length === 6 || m.length === 8) {
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

/**
 * ISO-4217 currency code → ISO-3166-alpha-2 country code mapping for
 * common trading currencies. Used by `countryCodeToFlag` to recognise
 * 3-letter inputs like `'USD'` and emit the right flag without forcing
 * the host to maintain a parallel column.
 *
 * `EUR` → `EU` is special: the EU has no ISO-3166-alpha-2 code, but
 * the regional-indicator pair `E+U` renders as 🇪🇺 in every modern
 * font. Bullion / crypto codes (`XAU`, `XAG`, `XPT`, `BTC`, …) and
 * inflation-unit codes (`XDR`, `XSU`) deliberately have no entry —
 * the renderer just emits an empty string for them.
 */
const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', CHF: 'CH',
  CAD: 'CA', AUD: 'AU', NZD: 'NZ', HKD: 'HK', SGD: 'SG',
  CNY: 'CN', CNH: 'CN', INR: 'IN', KRW: 'KR', BRL: 'BR',
  MXN: 'MX', ZAR: 'ZA', RUB: 'RU', TRY: 'TR',
  SEK: 'SE', NOK: 'NO', DKK: 'DK',
  PLN: 'PL', CZK: 'CZ', HUF: 'HU', RON: 'RO', BGN: 'BG',
  ILS: 'IL', AED: 'AE', SAR: 'SA', QAR: 'QA', KWD: 'KW',
  THB: 'TH', IDR: 'ID', PHP: 'PH', MYR: 'MY', VND: 'VN',
  TWD: 'TW', PKR: 'PK', LKR: 'LK', BDT: 'BD',
  EGP: 'EG', NGN: 'NG', KES: 'KE', GHS: 'GH', MAD: 'MA',
  ARS: 'AR', CLP: 'CL', COP: 'CO', PEN: 'PE', UYU: 'UY',
  ISK: 'IS', UAH: 'UA',
};

/**
 * String → regional-indicator emoji flag.
 *
 *  - 2-letter input → treated as ISO-3166-alpha-2 country code.
 *  - 3-letter input → looked up in `CURRENCY_TO_COUNTRY`; if known,
 *    the mapped country code is converted (`USD` → `US` → 🇺🇸,
 *    `EUR` → `EU` → 🇪🇺).
 *  - Anything else → empty string.
 */
function countryCodeToFlag(code: unknown): string {
  if (typeof code !== 'string') return '';
  const raw = code.trim().toUpperCase();
  let cc: string | undefined;
  if (/^[A-Z]{2}$/.test(raw)) cc = raw;
  else if (/^[A-Z]{3}$/.test(raw)) cc = CURRENCY_TO_COUNTRY[raw];
  if (!cc || cc.length !== 2) return '';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

// ── Pill (configurable value → colour) ────────────────────────
export class PillCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private cfg: PillRendererConfig | undefined;
  private unwatch: (() => void) | null = null;

  init(params: ICellRendererParams & PillRendererConfig) {
    this.value = params.value;
    this.cfg = pickPillCfg(params);
    this.eGui = document.createElement('span');
    this.paint();
    this.unwatch = watchThemeMode(() => this.paint());
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & PillRendererConfig): boolean {
    this.value = params.value;
    this.cfg = pickPillCfg(params);
    this.paint();
    return true;
  }

  destroy() { this.unwatch?.(); this.unwatch = null; }

  private paint() {
    const cfg = this.cfg;
    const mode = readThemeMode();
    const text = this.value == null ? '' : String(this.value);
    this.eGui.textContent = text;

    let chosen: PillRendererConfig['fallback'] | undefined;
    if (cfg) {
      const match = cfg.rules.find((r) => r.value === text);
      chosen = match
        ? { bg: match.bg, fg: match.fg, border: match.border }
        : cfg.fallback;
    }

    if (!chosen) {
      // No rule matched and no fallback — plain text, no pill.
      this.eGui.removeAttribute('style');
      return;
    }

    const bg = pickThemeColor(chosen.bg, mode);
    const fg = pickThemeColor(chosen.fg, mode);
    const border = pickThemeColor(chosen.border, mode);
    const radius = cfg?.shape === 'square' ? '2px' : '9999px';
    Object.assign(this.eGui.style, {
      display: 'inline-block',
      fontFamily: MONO,
      fontSize: '10px',
      fontWeight: '600',
      letterSpacing: '0.04em',
      padding: '1px 8px',
      borderRadius: radius,
      background: bg,
      color: fg || '',
      border: border ? `1px solid ${border}` : '',
      lineHeight: '16px',
    } as Partial<CSSStyleDeclaration>);
  }
}

function pickPillCfg(
  params: ICellRendererParams & PillRendererConfig,
): PillRendererConfig | undefined {
  const rules = (params as { rules?: PillRendererConfig['rules'] }).rules;
  if (!Array.isArray(rules)) return undefined;
  return {
    rules,
    fallback: (params as { fallback?: PillRendererConfig['fallback'] }).fallback,
    shape: (params as { shape?: PillRendererConfig['shape'] }).shape,
  };
}

// ── Heatmap (numeric gradient) ────────────────────────────────
export class HeatmapCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private cfg: HeatmapRendererConfig | undefined;
  private unwatch: (() => void) | null = null;

  init(params: ICellRendererParams & HeatmapRendererConfig) {
    this.value = params.value;
    this.cfg = pickHeatmapCfg(params);
    this.eGui = document.createElement('span');
    this.paint(params);
    this.unwatch = watchThemeMode(() => this.paint(params));
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & HeatmapRendererConfig): boolean {
    this.value = params.value;
    this.cfg = pickHeatmapCfg(params);
    this.paint(params);
    return true;
  }

  destroy() { this.unwatch?.(); this.unwatch = null; }

  private paint(params: ICellRendererParams) {
    const cfg = this.cfg;
    const mode = readThemeMode();
    const n = Number(this.value);
    const text = params.valueFormatted ?? (Number.isFinite(n) ? String(n) : (this.value == null ? '' : String(this.value)));
    this.eGui.textContent = text;
    if (!cfg || !Number.isFinite(n)) { this.eGui.removeAttribute('style'); return; }

    const min = cfg.domain?.min ?? 0;
    const max = cfg.domain?.max ?? 100;
    const range = max - min || 1;
    const t = Math.max(0, Math.min(1, (n - min) / range));

    const minC = pickThemeColor(cfg.colorScale.min, mode);
    const maxC = pickThemeColor(cfg.colorScale.max, mode);
    const midC = pickThemeColor(cfg.colorScale.mid, mode);
    let bg: string;
    if (midC && t < 0.5) bg = lerpHex(minC, midC, t * 2);
    else if (midC) bg = lerpHex(midC, maxC, (t - 0.5) * 2);
    else bg = lerpHex(minC, maxC, t);

    Object.assign(this.eGui.style, {
      display: 'inline-block',
      width: '100%',
      padding: '0 6px',
      background: bg,
      color: pickThemeColor(cfg.textColor, mode) || '',
      fontFamily: MONO,
      lineHeight: '24px',
    } as Partial<CSSStyleDeclaration>);
  }
}

function pickHeatmapCfg(p: ICellRendererParams & HeatmapRendererConfig): HeatmapRendererConfig | undefined {
  const scale = (p as { colorScale?: HeatmapRendererConfig['colorScale'] }).colorScale;
  if (!scale) return undefined;
  return {
    colorScale: scale,
    domain: (p as { domain?: HeatmapRendererConfig['domain'] }).domain,
    textColor: (p as { textColor?: HeatmapRendererConfig['textColor'] }).textColor,
  };
}

// ── Percent bar (proportional fill) ───────────────────────────
export class PercentBarCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private cfg: PercentBarRendererConfig | undefined;
  private params!: ICellRendererParams;
  private unwatch: (() => void) | null = null;

  init(params: ICellRendererParams & PercentBarRendererConfig) {
    this.value = params.value;
    this.cfg = pickPercentBarCfg(params);
    this.params = params;
    this.eGui = document.createElement('div');
    Object.assign(this.eGui.style, {
      position: 'relative', width: '100%', height: '14px', borderRadius: '2px', overflow: 'hidden',
    } as Partial<CSSStyleDeclaration>);
    this.paint();
    this.unwatch = watchThemeMode(() => this.paint());
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & PercentBarRendererConfig): boolean {
    this.value = params.value;
    this.cfg = pickPercentBarCfg(params);
    this.params = params;
    this.paint();
    return true;
  }

  destroy() { this.unwatch?.(); this.unwatch = null; }

  private paint() {
    while (this.eGui.firstChild) this.eGui.removeChild(this.eGui.firstChild);
    const cfg = this.cfg;
    if (!cfg) return;
    const n = Number(this.value);
    if (!Number.isFinite(n)) return;
    const max = typeof cfg.max === 'number'
      ? cfg.max
      : Number((this.params.data as Record<string, unknown> | undefined)?.[cfg.max.fromField]) || 1;
    const pct = Math.max(0, Math.min(1, n / (max || 1)));
    const mode = readThemeMode();
    const barColor = pickThemeColor(cfg.barColor, mode);
    const trackColor = pickThemeColor(cfg.trackColor, mode) || 'rgba(127,127,127,0.18)';
    this.eGui.style.background = trackColor;

    const bar = document.createElement('div');
    Object.assign(bar.style, {
      width: `${pct * 100}%`, height: '100%', background: barColor, transition: 'width 0.18s ease-out',
    } as Partial<CSSStyleDeclaration>);
    this.eGui.appendChild(bar);

    if (cfg.showPercent || cfg.showValue) {
      const label = document.createElement('span');
      Object.assign(label.style, {
        position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: MONO, fontSize: '10px', mixBlendMode: 'difference', color: 'white',
      } as Partial<CSSStyleDeclaration>);
      label.textContent = cfg.showPercent ? `${(pct * 100).toFixed(0)}%` : String(n);
      this.eGui.appendChild(label);
    }
  }
}

function pickPercentBarCfg(p: ICellRendererParams & PercentBarRendererConfig): PercentBarRendererConfig | undefined {
  const max = (p as { max?: PercentBarRendererConfig['max'] }).max;
  const barColor = (p as { barColor?: PercentBarRendererConfig['barColor'] }).barColor;
  if (max === undefined || !barColor) return undefined;
  return {
    max,
    barColor,
    trackColor: (p as { trackColor?: PercentBarRendererConfig['trackColor'] }).trackColor,
    showPercent: (p as { showPercent?: boolean }).showPercent,
    showValue: (p as { showValue?: boolean }).showValue,
  };
}

// ── Trend arrow + delta ───────────────────────────────────────
export class TrendArrowCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private cfg: TrendArrowRendererConfig | undefined;
  private unwatch: (() => void) | null = null;

  init(params: ICellRendererParams & TrendArrowRendererConfig) {
    this.value = params.value;
    this.cfg = pickTrendCfg(params);
    this.eGui = document.createElement('span');
    this.paint();
    this.unwatch = watchThemeMode(() => this.paint());
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & TrendArrowRendererConfig): boolean {
    this.value = params.value;
    this.cfg = pickTrendCfg(params);
    this.paint();
    return true;
  }

  destroy() { this.unwatch?.(); this.unwatch = null; }

  private paint() {
    while (this.eGui.firstChild) this.eGui.removeChild(this.eGui.firstChild);
    const cfg = this.cfg;
    if (!cfg) return;
    const n = Number(this.value);
    if (!Number.isFinite(n)) return;
    const threshold = cfg.threshold ?? 0;
    const mode = readThemeMode();
    const direction: 'up' | 'down' | 'flat' =
      n > threshold ? 'up' : n < -threshold ? 'down' : 'flat';
    const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '◆';
    const color =
      direction === 'up'
        ? pickThemeColor(cfg.upColor, mode)
        : direction === 'down'
          ? pickThemeColor(cfg.downColor, mode)
          : pickThemeColor(cfg.neutralColor, mode) || 'var(--ds-text-muted)';

    Object.assign(this.eGui.style, {
      display: 'inline-flex', gap: '4px', alignItems: 'center', fontFamily: MONO, color,
    } as Partial<CSSStyleDeclaration>);
    const arrowEl = document.createElement('span');
    arrowEl.textContent = arrow;
    arrowEl.style.fontSize = '8px';
    this.eGui.appendChild(arrowEl);
    if (cfg.showDelta !== false) {
      const dec = cfg.decimals ?? 2;
      const text = `${n > 0 ? '+' : ''}${n.toFixed(dec)}`;
      const valEl = document.createElement('span');
      valEl.textContent = text;
      this.eGui.appendChild(valEl);
    }
  }
}

function pickTrendCfg(p: ICellRendererParams & TrendArrowRendererConfig): TrendArrowRendererConfig | undefined {
  const up = (p as { upColor?: TrendArrowRendererConfig['upColor'] }).upColor;
  const down = (p as { downColor?: TrendArrowRendererConfig['downColor'] }).downColor;
  if (!up || !down) return undefined;
  return {
    upColor: up,
    downColor: down,
    neutralColor: (p as { neutralColor?: TrendArrowRendererConfig['neutralColor'] }).neutralColor,
    threshold: (p as { threshold?: number }).threshold,
    decimals: (p as { decimals?: number }).decimals,
    showDelta: (p as { showDelta?: boolean }).showDelta,
  };
}

// ── Sparkline (inline SVG) ────────────────────────────────────
export class SparklineCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private cfg: SparklineRendererConfig | undefined;
  private unwatch: (() => void) | null = null;

  init(params: ICellRendererParams & SparklineRendererConfig) {
    this.value = params.value;
    this.cfg = pickSparklineCfg(params);
    this.eGui = document.createElement('div');
    this.eGui.style.display = 'inline-flex';
    this.eGui.style.alignItems = 'center';
    this.eGui.style.width = '100%';
    this.paint();
    this.unwatch = watchThemeMode(() => this.paint());
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & SparklineRendererConfig): boolean {
    this.value = params.value;
    this.cfg = pickSparklineCfg(params);
    this.paint();
    return true;
  }

  destroy() { this.unwatch?.(); this.unwatch = null; }

  private paint() {
    while (this.eGui.firstChild) this.eGui.removeChild(this.eGui.firstChild);
    const cfg = this.cfg;
    const data = Array.isArray(this.value)
      ? (this.value as unknown[]).map((v) => Number(v)).filter((v) => Number.isFinite(v))
      : [];
    if (!cfg || data.length < 2) return;

    const mode = readThemeMode();
    const lineColor = pickThemeColor(cfg.lineColor, mode);
    const fillColor = pickThemeColor(cfg.fillColor, mode);
    const height = Math.max(8, cfg.height ?? 18);
    const width = 80; // SVG coordinate space; CSS stretches to cell width
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = '100%';
    svg.style.height = `${height}px`;

    if (cfg.variant === 'bar') {
      const barW = width / data.length;
      data.forEach((v, i) => {
        const h = ((v - min) / span) * height;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(i * barW));
        rect.setAttribute('y', String(height - h));
        rect.setAttribute('width', String(barW * 0.8));
        rect.setAttribute('height', String(h));
        rect.setAttribute('fill', lineColor);
        svg.appendChild(rect);
      });
    } else {
      const pts = data.map((v, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((v - min) / span) * height;
        return `${x},${y}`;
      });
      if (cfg.variant === 'area') {
        const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M0,${height} L${pts.join(' L')} L${width},${height} Z`;
        area.setAttribute('d', d);
        area.setAttribute('fill', fillColor || lineColor);
        area.setAttribute('fill-opacity', fillColor ? '1' : '0.25');
        svg.appendChild(area);
      }
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('points', pts.join(' '));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', lineColor);
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(line);
    }
    this.eGui.appendChild(svg);
  }
}

function pickSparklineCfg(p: ICellRendererParams & SparklineRendererConfig): SparklineRendererConfig | undefined {
  const variant = (p as { variant?: SparklineRendererConfig['variant'] }).variant;
  const line = (p as { lineColor?: SparklineRendererConfig['lineColor'] }).lineColor;
  if (!variant || !line) return undefined;
  return {
    variant,
    lineColor: line,
    fillColor: (p as { fillColor?: SparklineRendererConfig['fillColor'] }).fillColor,
    height: (p as { height?: number }).height,
  };
}

// ── Multi-line (primary + secondary text) ─────────────────────
export class MultiLineCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private data: unknown;
  private cfg: MultiLineRendererConfig | undefined;
  private unwatch: (() => void) | null = null;

  init(params: ICellRendererParams & MultiLineRendererConfig) {
    this.value = params.value;
    this.data = params.data;
    this.cfg = pickMultiLineCfg(params);
    this.eGui = document.createElement('div');
    Object.assign(this.eGui.style, {
      display: 'flex', flexDirection: 'column', lineHeight: '1.1', justifyContent: 'center', height: '100%',
    } as Partial<CSSStyleDeclaration>);
    this.paint();
    this.unwatch = watchThemeMode(() => this.paint());
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & MultiLineRendererConfig): boolean {
    this.value = params.value;
    this.data = params.data;
    this.cfg = pickMultiLineCfg(params);
    this.paint();
    return true;
  }

  destroy() { this.unwatch?.(); this.unwatch = null; }

  private paint() {
    while (this.eGui.firstChild) this.eGui.removeChild(this.eGui.firstChild);
    const cfg = this.cfg;
    const primary = this.value == null ? '' : String(this.value);
    const primaryEl = document.createElement('span');
    primaryEl.textContent = primary;
    this.eGui.appendChild(primaryEl);
    if (!cfg) return;
    const secondaryRaw = (this.data as Record<string, unknown> | undefined)?.[cfg.secondaryField];
    if (secondaryRaw == null) return;
    const sec = document.createElement('span');
    const mode = readThemeMode();
    Object.assign(sec.style, {
      fontSize: `${cfg.secondarySize ?? 10}px`,
      color: pickThemeColor(cfg.secondaryColor, mode) || 'var(--ds-text-muted)',
      fontFamily: MONO,
    } as Partial<CSSStyleDeclaration>);
    sec.textContent = String(secondaryRaw);
    this.eGui.appendChild(sec);
  }
}

function pickMultiLineCfg(p: ICellRendererParams & MultiLineRendererConfig): MultiLineRendererConfig | undefined {
  const field = (p as { secondaryField?: string }).secondaryField;
  if (!field) return undefined;
  return {
    secondaryField: field,
    secondaryColor: (p as { secondaryColor?: MultiLineRendererConfig['secondaryColor'] }).secondaryColor,
    secondarySize: (p as { secondarySize?: number }).secondarySize,
  };
}

// ── Icon + text ───────────────────────────────────────────────
export class IconTextCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private cfg: IconTextRendererConfig | undefined;
  private unwatch: (() => void) | null = null;

  init(params: ICellRendererParams & IconTextRendererConfig) {
    this.value = params.value;
    this.cfg = pickIconTextCfg(params);
    this.eGui = document.createElement('span');
    Object.assign(this.eGui.style, {
      display: 'inline-flex', alignItems: 'center', gap: '6px', height: '100%',
    } as Partial<CSSStyleDeclaration>);
    this.paint();
    this.unwatch = watchThemeMode(() => this.paint());
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & IconTextRendererConfig): boolean {
    this.value = params.value;
    this.cfg = pickIconTextCfg(params);
    this.paint();
    return true;
  }

  destroy() { this.unwatch?.(); this.unwatch = null; }

  private paint() {
    while (this.eGui.firstChild) this.eGui.removeChild(this.eGui.firstChild);
    const cfg = this.cfg;
    const text = this.value == null ? '' : String(this.value);
    const mode = readThemeMode();
    const color = cfg?.iconColor ? pickThemeColor(cfg.iconColor, mode) : 'currentColor';

    const icon = document.createElement('span');
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.style.width = '14px';
    icon.style.height = '14px';
    icon.style.color = color;
    if (cfg?.iconSvg) {
      // The editor stores the full SVG markup string (from
      // @wellsfargo-starui/icons-svg `MARKET_ICON_SVGS`). Drop it in and force
      // the inner <svg> to 14×14 — `currentColor` propagates from
      // the wrapper's `color` style.
      icon.innerHTML = cfg.iconSvg;
      const svg = icon.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
      }
    }

    const textEl = document.createElement('span');
    textEl.textContent = text;

    const pos = cfg?.position ?? 'left';
    if (pos === 'right') {
      this.eGui.appendChild(textEl);
      this.eGui.appendChild(icon);
    } else {
      this.eGui.appendChild(icon);
      this.eGui.appendChild(textEl);
    }
  }
}

function pickIconTextCfg(p: ICellRendererParams & IconTextRendererConfig): IconTextRendererConfig | undefined {
  const svg = (p as { iconSvg?: string }).iconSvg;
  if (svg === undefined) return undefined;
  return {
    iconId: (p as { iconId?: string }).iconId ?? '',
    iconSvg: svg,
    iconColor: (p as { iconColor?: IconTextRendererConfig['iconColor'] }).iconColor,
    position: (p as { position?: IconTextRendererConfig['position'] }).position ?? 'left',
  };
}

// ── Country flag + label ──────────────────────────────────────
export class CountryFlagCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private data: unknown;
  private cfg: CountryFlagRendererConfig | undefined;

  init(params: ICellRendererParams & CountryFlagRendererConfig) {
    this.value = params.value;
    this.data = params.data;
    this.cfg = pickCountryFlagCfg(params);
    this.eGui = document.createElement('span');
    Object.assign(this.eGui.style, {
      display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: MONO,
    } as Partial<CSSStyleDeclaration>);
    this.paint();
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & CountryFlagRendererConfig): boolean {
    this.value = params.value;
    this.data = params.data;
    this.cfg = pickCountryFlagCfg(params);
    this.paint();
    return true;
  }

  private paint() {
    while (this.eGui.firstChild) this.eGui.removeChild(this.eGui.firstChild);
    const cfg = this.cfg ?? {};
    const codeRaw = cfg.codeField
      ? (this.data as Record<string, unknown> | undefined)?.[cfg.codeField]
      : this.value;
    const labelRaw = cfg.labelField
      ? (this.data as Record<string, unknown> | undefined)?.[cfg.labelField]
      : this.value;
    const flag = countryCodeToFlag(codeRaw);
    const flagEl = document.createElement('span');
    flagEl.textContent = flag;
    flagEl.style.fontSize = '15px';
    this.eGui.appendChild(flagEl);
    if (cfg.showLabel !== false && labelRaw != null) {
      const lbl = document.createElement('span');
      lbl.textContent = String(labelRaw);
      this.eGui.appendChild(lbl);
    }
  }
}

function pickCountryFlagCfg(p: ICellRendererParams & CountryFlagRendererConfig): CountryFlagRendererConfig | undefined {
  // Config is fully optional — every field has a default; only return undefined
  // if no marker fields are present so the renderer can still fall back to
  // treating the cell value as the country code.
  return {
    codeField: (p as { codeField?: string }).codeField,
    labelField: (p as { labelField?: string }).labelField,
    showLabel: (p as { showLabel?: boolean }).showLabel,
  };
}

// ── Rating delta ──────────────────────────────────────────────
export class RatingDeltaCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private data: unknown;
  private cfg: RatingDeltaRendererConfig | undefined;
  private unwatch: (() => void) | null = null;

  init(params: ICellRendererParams & RatingDeltaRendererConfig) {
    this.value = params.value;
    this.data = params.data;
    this.cfg = pickRatingDeltaCfg(params);
    this.eGui = document.createElement('span');
    Object.assign(this.eGui.style, {
      display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: MONO, fontSize: '11px',
    } as Partial<CSSStyleDeclaration>);
    this.paint();
    this.unwatch = watchThemeMode(() => this.paint());
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & RatingDeltaRendererConfig): boolean {
    this.value = params.value;
    this.data = params.data;
    this.cfg = pickRatingDeltaCfg(params);
    this.paint();
    return true;
  }

  destroy() { this.unwatch?.(); this.unwatch = null; }

  private paint() {
    while (this.eGui.firstChild) this.eGui.removeChild(this.eGui.firstChild);
    const cfg = this.cfg;
    const cur = this.value == null ? '' : String(this.value);
    const curEl = document.createElement('span');
    curEl.textContent = cur;
    this.eGui.appendChild(curEl);
    if (!cfg) return;
    const prev = (this.data as Record<string, unknown> | undefined)?.[cfg.previousField];
    if (prev == null) return;
    const prevS = String(prev);
    if (prevS === cur) return;
    const curIdx = cfg.scale.indexOf(cur);
    const prevIdx = cfg.scale.indexOf(prevS);
    if (curIdx === -1 || prevIdx === -1) return;
    // Scale is ordered HIGH → LOW, so an upgrade has a LOWER index than the previous.
    const isUpgrade = curIdx < prevIdx;
    const mode = readThemeMode();
    const arrow = document.createElement('span');
    arrow.textContent = isUpgrade ? '▲' : '▼';
    arrow.style.fontSize = '8px';
    arrow.style.color = pickThemeColor(isUpgrade ? cfg.upColor : cfg.downColor, mode);
    this.eGui.appendChild(arrow);
  }
}

function pickRatingDeltaCfg(p: ICellRendererParams & RatingDeltaRendererConfig): RatingDeltaRendererConfig | undefined {
  const scale = (p as { scale?: string[] }).scale;
  const prev = (p as { previousField?: string }).previousField;
  const up = (p as { upColor?: RatingDeltaRendererConfig['upColor'] }).upColor;
  const down = (p as { downColor?: RatingDeltaRendererConfig['downColor'] }).downColor;
  if (!Array.isArray(scale) || !prev || !up || !down) return undefined;
  return { scale, previousField: prev, upColor: up, downColor: down };
}

// ── Time since (auto-refreshing relative time) ────────────────
export class TimeSinceCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private cfg: TimeSinceRendererConfig | undefined;
  private interval: ReturnType<typeof setInterval> | null = null;
  private unwatch: (() => void) | null = null;

  init(params: ICellRendererParams & TimeSinceRendererConfig) {
    this.value = params.value;
    this.cfg = pickTimeSinceCfg(params);
    this.eGui = document.createElement('span');
    this.eGui.style.fontFamily = MONO;
    this.paint();
    const refreshSec = this.cfg?.refreshSec ?? 60;
    this.interval = setInterval(() => this.paint(), refreshSec * 1000);
    this.unwatch = watchThemeMode(() => this.paint());
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & TimeSinceRendererConfig): boolean {
    this.value = params.value;
    this.cfg = pickTimeSinceCfg(params);
    this.paint();
    return true;
  }

  destroy() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.unwatch?.();
    this.unwatch = null;
  }

  private paint() {
    const ts = toEpochMillis(this.value);
    if (ts === null) { this.eGui.textContent = ''; this.eGui.removeAttribute('style'); this.eGui.style.fontFamily = MONO; return; }
    const now = Date.now();
    const deltaSec = Math.round((now - ts) / 1000);
    this.eGui.textContent = formatRelative(deltaSec);
    if (deltaSec < 0 && this.cfg?.futureColor) {
      this.eGui.style.color = pickThemeColor(this.cfg.futureColor, readThemeMode());
    } else {
      this.eGui.style.color = '';
    }
  }
}

function pickTimeSinceCfg(p: ICellRendererParams & TimeSinceRendererConfig): TimeSinceRendererConfig | undefined {
  return {
    refreshSec: (p as { refreshSec?: number }).refreshSec,
    futureColor: (p as { futureColor?: TimeSinceRendererConfig['futureColor'] }).futureColor,
  };
}

function toEpochMillis(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Epoch seconds vs millis heuristic: < 10^12 ≈ seconds before 2001-09-09.
    return v < 1e12 ? v * 1000 : v;
  }
  if (typeof v === 'string') {
    const n = Date.parse(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function formatRelative(secAgo: number): string {
  const absSec = Math.abs(secAgo);
  const suffix = secAgo < 0 ? 'from now' : 'ago';
  if (absSec < 5) return 'just now';
  if (absSec < 60) return `${absSec}s ${suffix}`;
  if (absSec < 3600) return `${Math.floor(absSec / 60)}m ${suffix}`;
  if (absSec < 86400) return `${Math.floor(absSec / 3600)}h ${suffix}`;
  return `${Math.floor(absSec / 86400)}d ${suffix}`;
}

// ── Allocation bar (stacked horizontal segments) ──────────────
export class AllocationBarCellRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  private value: unknown;
  private cfg: AllocationBarRendererConfig | undefined;
  private unwatch: (() => void) | null = null;

  init(params: ICellRendererParams & AllocationBarRendererConfig) {
    this.value = params.value;
    this.cfg = pickAllocationBarCfg(params);
    this.eGui = document.createElement('div');
    Object.assign(this.eGui.style, {
      display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', justifyContent: 'center', height: '100%',
    } as Partial<CSSStyleDeclaration>);
    this.paint();
    this.unwatch = watchThemeMode(() => this.paint());
  }

  getGui() { return this.eGui; }

  refresh(params: ICellRendererParams & AllocationBarRendererConfig): boolean {
    this.value = params.value;
    this.cfg = pickAllocationBarCfg(params);
    this.paint();
    return true;
  }

  destroy() { this.unwatch?.(); this.unwatch = null; }

  private paint() {
    while (this.eGui.firstChild) this.eGui.removeChild(this.eGui.firstChild);
    const cfg = this.cfg;
    if (!cfg) return;
    const segments = normaliseSegments(this.value);
    if (segments.length === 0) return;
    const total = segments.reduce((s, x) => s + x.weight, 0) || 1;
    const mode = readThemeMode();

    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex', width: '100%', height: '10px', borderRadius: '2px', overflow: 'hidden',
    } as Partial<CSSStyleDeclaration>);
    for (const seg of segments) {
      const pct = (seg.weight / total) * 100;
      const block = document.createElement('div');
      block.style.width = `${pct}%`;
      block.style.background = pickThemeColor(cfg.segmentColorMap[seg.key], mode) || 'rgba(127,127,127,0.4)';
      block.title = `${seg.key}: ${seg.weight}`;
      bar.appendChild(block);
    }
    this.eGui.appendChild(bar);

    if (cfg.legend) {
      const legend = document.createElement('div');
      Object.assign(legend.style, {
        display: 'flex', flexWrap: 'wrap', gap: '6px', fontFamily: MONO, fontSize: '9px',
      } as Partial<CSSStyleDeclaration>);
      for (const seg of segments) {
        const item = document.createElement('span');
        Object.assign(item.style, { display: 'inline-flex', alignItems: 'center', gap: '3px' } as Partial<CSSStyleDeclaration>);
        const swatch = document.createElement('span');
        Object.assign(swatch.style, {
          width: '6px', height: '6px', borderRadius: '2px',
          background: pickThemeColor(cfg.segmentColorMap[seg.key], mode) || 'rgba(127,127,127,0.4)',
        } as Partial<CSSStyleDeclaration>);
        const label = document.createElement('span');
        label.textContent = seg.key;
        item.appendChild(swatch);
        item.appendChild(label);
        legend.appendChild(item);
      }
      this.eGui.appendChild(legend);
    }
  }
}

function pickAllocationBarCfg(p: ICellRendererParams & AllocationBarRendererConfig): AllocationBarRendererConfig | undefined {
  const map = (p as { segmentColorMap?: AllocationBarRendererConfig['segmentColorMap'] }).segmentColorMap;
  if (!map) return undefined;
  return {
    segmentColorMap: map,
    legend: (p as { legend?: boolean }).legend,
  };
}

function normaliseSegments(value: unknown): Array<{ key: string; weight: number }> {
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v && typeof v === 'object' && 'key' in v && 'weight' in v) {
          const k = (v as { key: unknown }).key;
          const w = Number((v as { weight: unknown }).weight);
          if (typeof k === 'string' && Number.isFinite(w)) return { key: k, weight: w };
        }
        return null;
      })
      .filter((x): x is { key: string; weight: number } => x !== null);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => ({ key: k, weight: Number(v) }))
      .filter((s) => Number.isFinite(s.weight));
  }
  return [];
}
