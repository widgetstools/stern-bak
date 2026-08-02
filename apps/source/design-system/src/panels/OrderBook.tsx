import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { Badge, ScrollArea } from '@wellsfargo-starui/react';
import { useMemo } from 'react';
import { buildDepth } from '../data/depth';
import type { Level, MidRow } from '../data/depth';
import { fmtPrice, fmtYield, fmtBps } from '../data/formatters';
import { makeRng } from '../data/seeds';
import type { Instrument, Quote } from '../data/types';
import { useDemoState } from '../state/DemoStateProvider';

// ── OrderBookHeader ─────────────────────────────────────────────────────────

interface HeaderProps {
  inst: Instrument;
  quote: Quote;
}

function OrderBookHeader({ inst, quote }: HeaderProps) {
  return (
    <div
      className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2"
      style={{ fontFamily: 'var(--ds-font-sans)', fontSize: 11 }}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-[color:var(--ds-text-primary)]">{inst.ticker}</span>
        <Badge
          variant="outline"
          className="text-[9px] text-[color:var(--ds-accent-positive)] border-[color:var(--ds-accent-positive)]"
        >
          ● LIVE
        </Badge>
      </div>
      <div className="mt-0.5 text-[10px] text-[color:var(--ds-text-secondary)]">{inst.description}</div>
      <div className="mt-0.5 flex gap-3 text-[10px] text-[color:var(--ds-text-secondary)]">
        <span>{inst.coupon}% · {inst.maturity.slice(0, 7)}</span>
        <span>{inst.cusip}</span>
        <span>{inst.rating}</span>
        <span>OAS {quote.oas} bp</span>
        <span>DV01 {quote.dv01.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ── LevelRow ─────────────────────────────────────────────────────────────────

interface LevelRowProps {
  level: Level;
  side: 'ask' | 'bid';
  onClick: (price: number) => void;
}

function LevelRow({ level, side, onClick }: LevelRowProps) {
  const textColor = side === 'ask'
    ? 'var(--ds-accent-negative)'
    : 'var(--ds-accent-positive)';
  const fillColor = side === 'ask'
    ? 'var(--ds-trade-ask-fill)'
    : 'var(--ds-trade-bid-fill)';

  return (
    <div
      className="relative flex cursor-pointer items-center gap-1 px-2 py-0.5 hover:bg-[color:var(--ds-state-hover-overlay)]"
      onClick={() => onClick(level.price)}
      style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 11 }}
    >
      <div
        className="absolute inset-y-0 right-0 opacity-25"
        style={{ width: `${level.cumPct}%`, background: fillColor }}
        aria-hidden
      />
      <span className="relative w-8 shrink-0 text-[color:var(--ds-text-secondary)]">
        {level.dealer}
      </span>
      <span className="relative w-16 text-right" style={{ color: textColor }}>
        {fmtPrice(level.price)}
      </span>
      <span className="relative w-14 text-right text-[color:var(--ds-text-secondary)]">
        {fmtYield(level.yield)}
      </span>
      <span className="relative w-10 text-right text-[color:var(--ds-text-secondary)]">
        {level.faceMM.toFixed(1)}M
      </span>
      <span className="relative w-12 text-right text-[color:var(--ds-text-secondary)]">
        {level.dv01.toFixed(1)}k
      </span>
      <span className="relative ml-auto">
        <Badge variant="outline" className="text-[9px] px-1 py-0">
          {level.type}
        </Badge>
      </span>
    </div>
  );
}

// ── LevelSection ──────────────────────────────────────────────────────────────

interface LevelSectionProps {
  levels: Level[];
  side: 'ask' | 'bid';
  label: string;
  onClick: (price: number) => void;
}

function LevelSection({ levels, side, label, onClick }: LevelSectionProps) {
  const labelColor = side === 'ask'
    ? 'var(--ds-accent-negative)'
    : 'var(--ds-accent-positive)';

  return (
    <div>
      <div
        className="sticky top-0 z-10 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: labelColor }}
      >
        {label}
      </div>
      {levels.map((level, i) => (
        <LevelRow key={`${side}-${i}`} level={level} side={side} onClick={onClick} />
      ))}
    </div>
  );
}

// ── MidRowBar ────────────────────────────────────────────────────────────────

function MidRowBar({ midRow }: { midRow: MidRow }) {
  return (
    <div
      className="shrink-0 flex items-center justify-around border-y border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] px-3 py-1"
      style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 11 }}
    >
      <span>
        <span className="text-[color:var(--ds-text-secondary)] mr-1">Mid</span>
        <span className="font-semibold text-[color:var(--ds-text-primary)]">{fmtPrice(midRow.mid)}</span>
      </span>
      <span>
        <span className="text-[color:var(--ds-text-secondary)] mr-1">Spd</span>
        <span className="text-[color:var(--ds-text-primary)]">{(midRow.spread * 100).toFixed(1)}¢</span>
      </span>
      <span>
        <span className="text-[color:var(--ds-text-secondary)] mr-1">Yld</span>
        <span className="text-[color:var(--ds-text-primary)]">{fmtYield(midRow.midYield)}</span>
      </span>
      <span>
        <span className="text-[color:var(--ds-text-secondary)] mr-1">Z</span>
        <span className="text-[color:var(--ds-text-primary)]">{fmtBps(midRow.zSpread)}</span>
      </span>
    </div>
  );
}

// ── OrderBookFooter ───────────────────────────────────────────────────────────

interface FooterProps {
  bidDv01: number;
  askDv01: number;
}

function OrderBookFooter({ bidDv01, askDv01 }: FooterProps) {
  return (
    <div
      className="shrink-0 flex items-center gap-4 border-t border-[color:var(--ds-border-primary)] px-3 py-1 text-[10px] text-[color:var(--ds-text-secondary)]"
    >
      <span>Bid DV01 <strong className="text-[color:var(--ds-text-primary)]">{bidDv01.toFixed(1)}k</strong></span>
      <span>Ask DV01 <strong className="text-[color:var(--ds-text-primary)]">{askDv01.toFixed(1)}k</strong></span>
      <span>Min 1MM</span>
      <span>Firm</span>
      <span>Settle T+1</span>
    </div>
  );
}

// ── OrderBookWidget (default export for dock registry) ────────────────────────

export default function OrderBookWidget(_props: WidgetProps) {
  const { store, selectedId, setClickedPrice } = useDemoState();
  const state = store.state;

  const inst = useMemo(
    () => state.instruments.find((i) => i.id === selectedId) ?? state.instruments[0],
    [state.instruments, selectedId],
  );
  const quote = useMemo(
    () => state.quotes[inst?.id ?? ''] ?? state.quotes[state.instruments[0]?.id ?? ''],
    [state.quotes, inst],
  );

  const depth = useMemo(() => {
    if (!inst || !quote) return null;
    const seed = Math.round(quote.mid * 100);
    return buildDepth(quote, inst, makeRng(seed));
  }, [inst, quote]);

  if (!inst || !quote || !depth) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-[color:var(--ds-text-secondary)]">
        No instrument selected
      </div>
    );
  }

  const bidDv01 = depth.bids.reduce((s, l) => s + l.dv01, 0);
  const askDv01 = depth.asks.reduce((s, l) => s + l.dv01, 0);

  return (
    <div className="flex h-full flex-col" data-testid="order-book">
      <OrderBookHeader inst={inst} quote={quote} />
      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="flex-1">
          <LevelSection
            levels={depth.asks}
            side="ask"
            label="Offers"
            onClick={setClickedPrice}
          />
          <MidRowBar midRow={depth.midRow} />
          <LevelSection
            levels={depth.bids}
            side="bid"
            label="Bids"
            onClick={setClickedPrice}
          />
        </ScrollArea>
      </div>
      <OrderBookFooter bidDv01={bidDv01} askDv01={askDv01} />
    </div>
  );
}

