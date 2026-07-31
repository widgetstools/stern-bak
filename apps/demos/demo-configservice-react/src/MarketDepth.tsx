/**
 * Market Depth view — Level-2 order-book ladder for equities.
 *
 * Visual language:
 *   • Single AG-Grid per symbol. Asks (worst→best top-to-bottom) stacked
 *     over bids (best→worst top-to-bottom) with a thin spread divider
 *     row in the middle.
 *   • Depth bars painted behind the size cell via a cellRenderer —
 *     cumulative size normalized across the visible ladder so the
 *     geometry stays legible even when one side is three times thicker.
 *   • Price-level pulse on mutation (ring flashes → fades in ~800ms).
 *     Driven by `book.flashes` set from marketDepthData's simulator.
 *   • L1 summary bar above the ladder: last price with directional
 *     chevron, bid/ask inside-market pair, spread in bps, and
 *     change-from-open with colour.
 *
 * Data is ticked by `createDepthFeed()` — subscribe per symbol, replace
 * rowData via `applyTransactionAsync({ update })` keyed on price so
 * AG-Grid re-renders only dirty cells (the flash state lives in the
 * grid cell context, not in a separate layer).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CellStyle,
  ColDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  ValueFormatterParams,
  GridOptions,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { agGridBlotterDarkParams, agGridBlotterLightParams } from '@wellsfargo-starui/design-system/adapters/ag-grid';
import { AgGridReact } from 'ag-grid-react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

import {
  createDepthFeed,
  type DepthFeed,
  type SymbolBook,
  type TradeSide,
} from './marketDepthData';

// ─── Row model ────────────────────────────────────────────────────────

type RowKind = 'ask' | 'bid' | 'spread';

interface LadderRow {
  id: string;            // stable rowId for AG-Grid transaction updates
  kind: RowKind;
  price: number;         // NaN on the spread divider row
  size: number;
  orders: number;
  cumulative: number;    // cumulative size from the touch outward
  depthPct: number;      // 0..1 for the bar fill
  flashSide: TradeSide | null;
  /** Distance from touch in ticks — 0 for best bid/ask. Used by the
   *  rowClassRules to tint the inside market more intensely. */
  levelsFromTouch: number;
  /** Only set on the spread row. */
  spreadTxt?: string;
}

function buildLadderRows(book: SymbolBook): LadderRow[] {
  // Normalize depth bar width using the max cumulative across BOTH
  // sides so a lopsided book doesn't make the thin side look huge.
  const askCums: number[] = [];
  let acc = 0;
  for (const l of book.asks) {
    acc += l.size;
    askCums.push(acc);
  }
  const bidCums: number[] = [];
  acc = 0;
  for (const l of book.bids) {
    acc += l.size;
    bidCums.push(acc);
  }
  const maxCum = Math.max(1, ...askCums, ...bidCums);

  const rows: LadderRow[] = [];

  // Asks — reversed so the WORST (highest) ask renders at the top of
  // the grid, and the BEST (lowest) ask renders just above the spread.
  for (let i = book.asks.length - 1; i >= 0; i--) {
    const l = book.asks[i];
    rows.push({
      id: `a-${l.price.toFixed(4)}`,
      kind: 'ask',
      price: l.price,
      size: l.size,
      orders: l.orders,
      cumulative: askCums[i],
      depthPct: askCums[i] / maxCum,
      flashSide: book.flashes[l.price.toFixed(4)] ?? null,
      levelsFromTouch: i,
    });
  }

  // Spread divider row.
  const spreadTxt = book.l1.spread != null && book.l1.mid != null && book.l1.mid > 0
    ? `${book.l1.spread.toFixed(2)}  (${((book.l1.spread / book.l1.mid) * 10000).toFixed(1)} bps)`
    : '—';
  rows.push({
    id: 'spread',
    kind: 'spread',
    price: NaN,
    size: 0,
    orders: 0,
    cumulative: 0,
    depthPct: 0,
    flashSide: null,
    levelsFromTouch: 0,
    spreadTxt,
  });

  // Bids — best (highest) first, descending.
  for (let i = 0; i < book.bids.length; i++) {
    const l = book.bids[i];
    rows.push({
      id: `b-${l.price.toFixed(4)}`,
      kind: 'bid',
      price: l.price,
      size: l.size,
      orders: l.orders,
      cumulative: bidCums[i],
      depthPct: bidCums[i] / maxCum,
      flashSide: book.flashes[l.price.toFixed(4)] ?? null,
      levelsFromTouch: i,
    });
  }

  return rows;
}

// ─── Cell renderers ───────────────────────────────────────────────────

/**
 * Depth bar behind the size cell. Bids grow LEFT→RIGHT with teal tint;
 * asks grow RIGHT→LEFT with crimson tint. The numeric label sits on
 * top at full opacity.
 */
function DepthBarRenderer(props: ICellRendererParams<LadderRow>) {
  const row = props.data;
  if (!row || row.kind === 'spread') return null;
  const isAsk = row.kind === 'ask';
  const pct = Math.max(0, Math.min(1, row.depthPct));

  const fill = isAsk
    ? 'linear-gradient(to left, rgba(239,68,68,0.22), rgba(239,68,68,0.04))'
    : 'linear-gradient(to right, rgba(20,184,166,0.22), rgba(20,184,166,0.04))';

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        style={{
          position: 'absolute',
          top: 2, bottom: 2,
          [isAsk ? 'right' : 'left']: 0,
          width: `${pct * 100}%`,
          background: fill,
          borderRadius: 2,
          transition: 'width 250ms cubic-bezier(0.2, 0.7, 0.2, 1)',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 8,
          fontVariantNumeric: 'tabular-nums',
          color: isAsk ? 'var(--ds-overlay-negative-soft)' : 'var(--ds-overlay-positive-soft)',
        }}
      >
        {props.value != null ? props.valueFormatted ?? String(props.value) : ''}
      </div>
    </div>
  );
}

/**
 * Price cell with optional flash ring when the level just mutated.
 * Colour keyed to trade side (buy = teal, sell = crimson).
 */
function PriceCellRenderer(props: ICellRendererParams<LadderRow>) {
  const row = props.data;
  if (!row) return null;
  if (row.kind === 'spread') {
    return (
      <div
        style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--ds-text-muted)', fontWeight: 600,
        }}
      >
        ↕ Spread · {row.spreadTxt}
      </div>
    );
  }
  const isAsk = row.kind === 'ask';
  const flashColor = row.flashSide === 'buy'
    ? 'rgba(20,184,166,0.35)'
    : row.flashSide === 'sell'
      ? 'rgba(239,68,68,0.35)'
      : null;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {flashColor && (
        <div
          key={`flash-${row.id}-${props.value}-${Date.now()}`}
          style={{
            position: 'absolute',
            inset: 1,
            boxShadow: `inset 0 0 0 1px ${flashColor}`,
            borderRadius: 2,
            animation: 'gcDepthFlash 800ms ease-out forwards',
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          position: 'relative', zIndex: 1,
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: isAsk ? 'var(--ds-overlay-negative-soft)' : 'var(--ds-overlay-positive-soft)',
          letterSpacing: '0.01em',
        }}
      >
        {props.valueFormatted ?? props.value}
      </div>
    </div>
  );
}

// ─── Grid config ──────────────────────────────────────────────────────
//
// Built from @wellsfargo-starui/design-system/adapters/ag-grid blotter params
// (reference-aligned Chroma Desk ultra-density) + depth-view overrides.
// MarketDepth sits between blotter (22/26) and standard (28/32) — use
// blotter as the base and override row/header heights to 24/28.

const depthOverrides = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  headerFontSize: 9,
  headerFontWeight: 700,
  rowHeight: 24,
  headerHeight: 28,
  borderColor: 'transparent',
  columnBorder: false,
  wrapperBorder: false,
  cellHorizontalPaddingScale: 0.5,
  spacing: 5,
  borderRadius: 0,
};

const darkDepthTheme  = themeQuartz.withParams({ ...agGridBlotterDarkParams,  ...depthOverrides });
const lightDepthTheme = themeQuartz.withParams({ ...agGridBlotterLightParams, ...depthOverrides });

const columnDefs: ColDef<LadderRow>[] = [
  {
    headerName: 'Bid Size',
    field: 'size',
    colId: 'bidSize',
    flex: 1,
    cellRenderer: DepthBarRenderer,
    valueGetter: (p) => (p.data?.kind === 'bid' ? p.data.size : null),
    valueFormatter: (p: ValueFormatterParams<LadderRow, number>) =>
      p.value != null ? p.value.toLocaleString() : '',
    cellStyle: { padding: 0 },
  },
  {
    headerName: '# Bid',
    field: 'orders',
    colId: 'bidOrders',
    width: 60,
    valueGetter: (p) => (p.data?.kind === 'bid' ? p.data.orders : null),
    cellStyle: {
      textAlign: 'center',
      color: 'var(--ds-text-muted)',
      fontVariantNumeric: 'tabular-nums',
    },
  },
  {
    headerName: 'Price',
    field: 'price',
    colId: 'price',
    width: 108,
    colSpan: (p) => (p.data?.kind === 'spread' ? 3 : 1),
    cellRenderer: PriceCellRenderer,
    valueFormatter: (p: ValueFormatterParams<LadderRow, number>) =>
      p.value != null && !Number.isNaN(p.value) ? p.value.toFixed(2) : '',
    cellStyle: (p): CellStyle => {
      if (p.data?.kind === 'spread') {
        return {
          padding: 0,
          background: 'linear-gradient(to bottom, rgba(100,116,139,0.12), rgba(100,116,139,0.04))',
        };
      }
      return { padding: 0 };
    },
  },
  {
    headerName: '# Ask',
    field: 'orders',
    colId: 'askOrders',
    width: 60,
    valueGetter: (p) => (p.data?.kind === 'ask' ? p.data.orders : null),
    cellStyle: {
      textAlign: 'center',
      color: 'var(--ds-text-muted)',
      fontVariantNumeric: 'tabular-nums',
    },
  },
  {
    headerName: 'Ask Size',
    field: 'size',
    colId: 'askSize',
    flex: 1,
    cellRenderer: DepthBarRenderer,
    valueGetter: (p) => (p.data?.kind === 'ask' ? p.data.size : null),
    valueFormatter: (p: ValueFormatterParams<LadderRow, number>) =>
      p.value != null ? p.value.toLocaleString() : '',
    cellStyle: { padding: 0 },
  },
];

// ─── L1 summary bar ───────────────────────────────────────────────────

function L1Bar({ book }: { book: SymbolBook | null }) {
  if (!book) return null;
  const l1 = book.l1;
  const dir = l1.change > 0 ? 'up' : l1.change < 0 ? 'down' : 'flat';
  const dirColor = dir === 'up' ? 'var(--ds-accent-positive)' : dir === 'down' ? 'var(--ds-accent-negative)' : 'var(--ds-text-muted)';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(140px, 220px) 1fr minmax(260px, 360px)',
        alignItems: 'center',
        gap: 24,
        padding: '14px 20px',
        borderBottom: '1px solid rgba(100,116,139,0.18)',
        background: 'linear-gradient(180deg, rgba(17,20,24,0.6) 0%, rgba(11,14,17,1) 100%)',
      }}
    >
      {/* Symbol + last */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: 'var(--ds-text-muted)', fontFamily: 'var(--ds-font-sans)', fontWeight: 600,
          }}
        >
          Last
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 28,
              fontWeight: 700,
              color: dirColor,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {l1.last != null ? l1.last.toFixed(2) : '—'}
          </span>
          {dir === 'up' && <ArrowUp size={14} strokeWidth={2.5} color={dirColor} />}
          {dir === 'down' && <ArrowDown size={14} strokeWidth={2.5} color={dirColor} />}
          {dir === 'flat' && <Minus size={14} strokeWidth={2.5} color={dirColor} />}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: dirColor,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {l1.change >= 0 ? '+' : ''}{l1.change.toFixed(2)}   {l1.changePct >= 0 ? '+' : ''}{l1.changePct.toFixed(2)}%
        </div>
      </div>

      {/* Bid / Ask inside market */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 14, justifyContent: 'center' }}>
        <InsideCell
          label="Bid"
          price={l1.bestBid}
          size={l1.bidSize}
          align="right"
          tintColor="var(--ds-accent-positive)"
        />
        <div
          style={{
            width: 1,
            background: 'linear-gradient(180deg, transparent, rgba(100,116,139,0.35), transparent)',
          }}
        />
        <InsideCell
          label="Ask"
          price={l1.bestAsk}
          size={l1.askSize}
          align="left"
          tintColor="var(--ds-accent-negative)"
        />
      </div>

      {/* Meta — spread, open, midpoint */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 22 }}>
        <Metric label="Spread" value={l1.spread != null ? l1.spread.toFixed(2) : '—'} />
        <Metric
          label="bps"
          value={l1.spread != null && l1.mid ? ((l1.spread / l1.mid) * 10000).toFixed(1) : '—'}
        />
        <Metric label="Mid" value={l1.mid != null ? l1.mid.toFixed(2) : '—'} />
        <Metric label="Open" value={l1.sessionOpen.toFixed(2)} />
      </div>
    </div>
  );
}

function InsideCell({
  label, price, size, align, tintColor,
}: {
  label: string;
  price: number | null;
  size: number;
  align: 'left' | 'right';
  tintColor: string;
}) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : 'flex-end',
        gap: 2,
        padding: '4px 14px',
        minWidth: 120,
      }}
    >
      <div
        style={{
          fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'var(--ds-text-muted)', fontFamily: 'var(--ds-font-sans)', fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 18,
          fontWeight: 700,
          color: tintColor,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {price != null ? price.toFixed(2) : '—'}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: 'var(--ds-text-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {size.toLocaleString()}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <span
        style={{
          fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'var(--ds-text-secondary)', fontFamily: 'var(--ds-font-sans)', fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ds-border-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Symbol chip rail ─────────────────────────────────────────────────

function SymbolChips({
  symbols,
  active,
  onPick,
  feed,
}: {
  symbols: readonly { symbol: string; sessionOpen: number }[];
  active: string;
  onPick: (s: string) => void;
  feed: DepthFeed;
}) {
  // Keep a tiny live subscription per symbol so the chip's last price
  // updates in real time — makes the rail feel like a watchlist.
  const [quotes, setQuotes] = useState<Record<string, { last: number | null; change: number; changePct: number }>>(() => {
    const initial: Record<string, { last: number | null; change: number; changePct: number }> = {};
    for (const spec of symbols) {
      const b = feed.getBook(spec.symbol);
      initial[spec.symbol] = {
        last: b?.l1.last ?? null,
        change: b?.l1.change ?? 0,
        changePct: b?.l1.changePct ?? 0,
      };
    }
    return initial;
  });

  useEffect(() => {
    const disposers: Array<() => void> = [];
    for (const spec of symbols) {
      const stop = feed.subscribe(spec.symbol, (book) => {
        setQuotes((q) => ({
          ...q,
          [spec.symbol]: { last: book.l1.last, change: book.l1.change, changePct: book.l1.changePct },
        }));
      });
      disposers.push(stop);
    }
    return () => { for (const d of disposers) d(); };
  }, [symbols, feed]);

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '10px 20px',
        borderBottom: '1px solid rgba(100,116,139,0.18)',
        overflowX: 'auto',
        background: 'var(--ds-surface-ground)',
      }}
    >
      {symbols.map((spec) => {
        const q = quotes[spec.symbol];
        const up = (q?.change ?? 0) > 0;
        const dn = (q?.change ?? 0) < 0;
        const isActive = active === spec.symbol;
        return (
          <button
            key={spec.symbol}
            onClick={() => onPick(spec.symbol)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              padding: '6px 12px',
              minWidth: 96,
              borderRadius: 4,
              border: '1px solid',
              borderColor: isActive ? 'rgba(45,212,191,0.55)' : 'rgba(100,116,139,0.2)',
              background: isActive
                ? 'linear-gradient(180deg, rgba(45,212,191,0.12), rgba(45,212,191,0.02))'
                : 'rgba(17,20,24,0.5)',
              color: isActive ? 'var(--ds-overlay-positive-soft)' : 'var(--ds-border-secondary)',
              cursor: 'pointer',
              transition: 'all 150ms',
              fontFamily: 'var(--ds-font-sans)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>
              {spec.symbol}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                color: up ? 'var(--ds-accent-positive)' : dn ? 'var(--ds-accent-negative)' : 'var(--ds-text-muted)',
                fontWeight: 600,
              }}
            >
              {q?.last != null ? q.last.toFixed(2) : '—'}
              {'  '}
              <span style={{ opacity: 0.8 }}>
                {(q?.changePct ?? 0) >= 0 ? '+' : ''}{(q?.changePct ?? 0).toFixed(2)}%
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export function MarketDepth({ isDark }: { isDark: boolean }) {
  const feed = useMemo<DepthFeed>(() => createDepthFeed({ levels: 10, intervalMs: 650 }), []);
  useEffect(() => () => feed.dispose(), [feed]);

  const [symbol, setSymbol] = useState<string>(() => feed.symbols[0]?.symbol ?? 'AAPL');
  const [book, setBook] = useState<SymbolBook | null>(() => feed.getBook(symbol) ?? null);
  const [running, setRunning] = useState<boolean>(feed.isRunning());

  // Pipe the active symbol's ticks into grid updates + local state.
  const gridApiRef = useRef<GridApi<LadderRow> | null>(null);
  const lastSymbolRef = useRef<string>(symbol);

  useEffect(() => {
    lastSymbolRef.current = symbol;
    const stop = feed.subscribe(symbol, (next) => {
      setBook(next);
      const api = gridApiRef.current;
      if (!api || lastSymbolRef.current !== symbol) return;
      // Build fresh rows and pump into the grid via transaction so only
      // changed rows re-render. Rows are stably keyed by price so rows
      // that DIDN'T move stay mounted and don't flash.
      const rows = buildLadderRows(next);
      try { api.setGridOption('rowData', rows); }
      catch { /* teardown */ }
    });
    // Seed on symbol change.
    const initial = feed.getBook(symbol);
    if (initial) setBook(initial);
    return stop;
  }, [symbol, feed]);

  const onGridReady = useCallback((ev: GridReadyEvent<LadderRow>) => {
    gridApiRef.current = ev.api;
    if (book) ev.api.setGridOption('rowData', buildLadderRows(book));
  }, [book]);

  const gridOptions: GridOptions<LadderRow> = useMemo(() => ({
    getRowId: (p) => p.data.id,
    suppressCellFocus: true,
    suppressMovableColumns: true,
    suppressDragLeaveHidesColumns: true,
    suppressRowHoverHighlight: false,
    animateRows: false,
    rowClassRules: {
      'ds-depth-spread-row': (p) => p.data?.kind === 'spread',
      'ds-depth-touch': (p) => p.data?.kind !== 'spread' && (p.data?.levelsFromTouch ?? 99) === 0,
    },
  }), []);

  const theme = isDark ? darkDepthTheme : lightDepthTheme;
  const rows = useMemo(() => (book ? buildLadderRows(book) : []), [book]);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: isDark ? 'var(--ds-surface-ground)' : 'var(--ds-surface-ground)',
        color: isDark ? 'var(--ds-text-primary)' : 'var(--ds-surface-secondary)',
      }}
    >
      {/* Depth-view styles — scoped classnames that ride on top of the
          AG theme. Defined inline so the view is self-contained. */}
      <style>{`
        @keyframes gcDepthFlash {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        .ds-depth-spread-row .ag-cell {
          background: rgba(100,116,139,0.06) !important;
          border-top: 1px solid rgba(100,116,139,0.25) !important;
          border-bottom: 1px solid rgba(100,116,139,0.25) !important;
        }
        .ds-depth-touch .ag-cell {
          background: rgba(45,212,191,0.04);
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px',
          borderBottom: '1px solid rgba(100,116,139,0.18)',
          background: isDark ? 'var(--ds-surface-ground)' : 'var(--ds-surface-ground)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase',
              color: 'var(--ds-text-muted)', fontFamily: 'var(--ds-font-sans)', fontWeight: 700,
            }}
          >
            Market Depth · Level II
          </span>
          <span
            style={{
              fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em',
              fontFamily: 'var(--ds-font-sans)',
              color: isDark ? 'var(--ds-surface-secondary)' : 'var(--ds-surface-secondary)',
            }}
          >
            {symbol}
          </span>
        </div>
        <button
          onClick={() => {
            if (running) feed.pause();
            else feed.resume();
            setRunning(feed.isRunning());
          }}
          data-testid="depth-feed-toggle"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px',
            borderRadius: 4,
            border: '1px solid',
            borderColor: running ? 'rgba(45,212,191,0.55)' : 'rgba(100,116,139,0.3)',
            background: running
              ? 'linear-gradient(180deg, rgba(45,212,191,0.15), rgba(45,212,191,0.03))'
              : 'rgba(17,20,24,0.5)',
            color: running ? 'var(--ds-overlay-positive-soft)' : 'var(--ds-text-muted)',
            cursor: 'pointer',
            fontFamily: 'var(--ds-font-sans)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: running ? 'var(--ds-accent-positive)' : 'var(--ds-text-muted)',
              boxShadow: running ? '0 0 8px var(--ds-accent-positive)' : 'none',
              animation: running ? 'gcTickPulse 1.4s ease-in-out infinite' : undefined,
            }}
          />
          {running ? 'Live Feed' : 'Paused'}
        </button>
      </div>

      {/* Symbol chips */}
      <SymbolChips
        symbols={feed.symbols}
        active={symbol}
        onPick={setSymbol}
        feed={feed}
      />

      {/* L1 summary */}
      <L1Bar book={book} />

      {/* L2 ladder */}
      <div style={{ flex: 1, padding: '0 20px 20px 20px' }}>
        <div style={{ height: '100%', paddingTop: 12 }}>
          <AgGridReact<LadderRow>
            theme={theme}
            rowData={rows}
            columnDefs={columnDefs}
            gridOptions={gridOptions}
            onGridReady={onGridReady}
            headerHeight={28}
            rowHeight={24}
          />
        </div>
      </div>
    </div>
  );
}
