// ─────────────────────────────────────────────────────────────
//  FI Design System — Vanilla TS AG Grid Cell Renderers
//  Framework-agnostic, works in both React and Angular.
//  Uses ICellRendererComp interface (init + getGui).
// ─────────────────────────────────────────────────────────────

import type { ICellRendererComp, ICellRendererParams } from 'ag-grid-community';

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
      fontSize: '9px', fontWeight: '700', letterSpacing: '0.05em',
      fontFamily: MONO,
      color: isBuy ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)',
    }, isBuy ? 'BUY' : 'SELL');
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── Status Badge (Filled / Partial / Pending / Cancelled) ──
const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  Filled:    { bg: 'rgba(20,217,160,0.12)',  color: 'var(--ds-accent-positive)',  border: 'rgba(20,217,160,0.3)' },
  Partial:   { bg: 'rgba(255,140,66,0.12)',  color: 'var(--ds-accent-warning)', border: 'rgba(255,140,66,0.3)' },
  Pending:   { bg: 'rgba(59,130,246,0.12)',  color: 'var(--ds-accent-info)',   border: 'rgba(59,130,246,0.3)' },
  Cancelled: { bg: 'rgba(255,77,109,0.10)', color: 'var(--ds-accent-negative)',    border: 'rgba(255,77,109,0.3)' },
  Working:   { bg: 'rgba(59,130,246,0.12)',  color: 'var(--ds-accent-info)',   border: 'rgba(59,130,246,0.3)' },
};

export class StatusBadgeRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const s = STATUS_STYLES[params.value] || STATUS_STYLES['Pending'];
    this.eGui = el('span', {
      fontFamily: MONO, fontSize: '9px', padding: '1px 6px', borderRadius: '2px',
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
      color: 'var(--ds-accent-info)',
    }, params.value);
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}

// ── Rating Badge (Aaa, Aa1, A2, Baa1, Ba2 etc.) ──
const RTG_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  aaa: { bg: 'rgba(20,217,160,0.1)',   color: 'var(--ds-accent-positive)',  border: 'rgba(20,217,160,0.25)' },
  aa:  { bg: 'rgba(20,217,160,0.06)',  color: 'var(--ds-accent-positive)',  border: 'rgba(20,217,160,0.2)' },
  a:   { bg: 'rgba(190,242,100,0.08)', color: 'var(--ds-accent-positive)',          border: 'rgba(132,204,22,0.25)' },
  bbb: { bg: 'rgba(255,140,66,0.08)',  color: 'var(--ds-accent-warning)', border: 'rgba(255,140,66,0.25)' },
  hy:  { bg: 'rgba(255,77,109,0.08)', color: 'var(--ds-accent-negative)',    border: 'rgba(255,77,109,0.25)' },
};

export class RatingBadgeRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const rtgClass = params.data?.rtgClass || 'bbb';
    const s = RTG_STYLES[rtgClass] || RTG_STYLES['bbb'];
    this.eGui = el('span', {
      fontFamily: MONO, fontSize: '9px', fontWeight: '700', letterSpacing: '0.04em',
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

// ── Filled Amount (green if fully filled, yellow if partial) ──
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
    this.eGui = el('span', { fontFamily: MONO, color: 'var(--ds-accent-info)' }, params.value);
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
  live:  { bg: 'rgba(59,130,246,0.1)',  color: 'var(--ds-accent-info)',  border: 'rgba(59,130,246,0.25)' },
  done:  { bg: 'rgba(20,217,160,0.12)', color: 'var(--ds-accent-positive)', border: 'rgba(20,217,160,0.25)' },
  stale: { bg: 'rgba(74,82,117,0.2)',   color: 'var(--ds-text-muted)',    border: 'rgba(74,82,117,0.25)' },
};

export class RfqStatusRenderer implements ICellRendererComp {
  private eGui!: HTMLElement;
  init(params: ICellRendererParams) {
    const status = params.value || 'live';
    const s = RFQ_STATUS_STYLES[status] || RFQ_STATUS_STYLES['live'];
    this.eGui = el('span', {
      fontFamily: MONO, fontSize: '9px', padding: '1px 6px', borderRadius: '2px',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }, status.toUpperCase());
  }
  getGui() { return this.eGui; }
  refresh() { return false; }
}
