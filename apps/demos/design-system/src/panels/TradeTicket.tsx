import { useState } from 'react';
import {
  Button, Input, Label,
  ToggleGroup, ToggleGroupItem,
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@wellsfargo-starui/ui';
import { toast } from '@wellsfargo-starui/ui';
import type { Instrument, Quote } from '../data/types';
import { fmtPrice, fmtYield } from '../data/formatters';
import { SideSelector } from '../components/SideSelector';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradeTicketProps {
  instrument: Instrument;
  quote: Quote;
  onClose?: () => void;
}

type Side = 'buy' | 'sell';
type OrderType = 'limit' | 'market' | 'stop-limit';
type Tif = 'gtc' | 'ioc' | 'fok' | 'day';

const MAX_NOTIONAL_MM = 10;

// ─── Security Header ──────────────────────────────────────────────────────────

function SecurityHeader({ instrument, quote }: { instrument: Instrument; quote: Quote }) {
  const coupon = `${instrument.coupon.toFixed(3)}%`;
  const maturity = instrument.maturity.slice(0, 7);
  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--ds-border-primary)', background: 'var(--ds-surface-secondary)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 'var(--ds-font-size-md)', fontWeight: 700, fontFamily: 'var(--ds-font-mono)', color: 'var(--ds-text-primary)' }}>
          {instrument.ticker.split(' ')[0]}
        </span>
        <span style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-muted)' }}>{coupon} · {maturity}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        <span style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-secondary)' }}>
          Mid <strong style={{ color: 'var(--ds-text-primary)', fontFamily: 'var(--ds-font-mono)' }}>{fmtPrice(quote.mid)}</strong>
        </span>
        <span style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-muted)' }}>
          YTM {fmtYield(quote.ytm)}
        </span>
        <span style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-muted)' }}>
          {instrument.rating}
        </span>
      </div>
    </div>
  );
}

// ─── Bid/Ask Strip ────────────────────────────────────────────────────────────

function BidAskStrip({ quote, onPickPrice }: { quote: Quote; onPickPrice: (p: number) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--ds-border-primary)' }}>
      {(['bid', 'ask'] as const).map((side) => {
        const isBid = side === 'bid';
        const price = isBid ? quote.bid : quote.ask;
        return (
          <button
            key={side}
            onClick={() => onPickPrice(price)}
            style={{
              background: isBid ? 'var(--ds-trade-bid-fill)' : 'var(--ds-trade-ask-fill)',
              border: '1px solid var(--ds-border-primary)',
              borderRadius: 'var(--ds-radius-sm)',
              padding: '6px 8px',
              cursor: 'pointer',
              textAlign: isBid ? 'left' : 'right',
            }}
          >
            <div style={{ fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {isBid ? 'Bid' : 'Ask'}
            </div>
            <div style={{ fontSize: 'var(--ds-font-size-md)', fontWeight: 700, fontFamily: 'var(--ds-font-mono)', color: isBid ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)' }}>
              {fmtPrice(price)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Suffixed input (e.g. price · USD, notional · MM) ──────────────────────────

function SuffixInput({ value, onChange, suffix, placeholder }: {
  value: string; onChange: (v: string) => void; suffix: string; placeholder?: string;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <Input
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-sm)', paddingRight: 40 }}
      />
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-muted)', pointerEvents: 'none', letterSpacing: '0.04em' }}>
        {suffix}
      </span>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
};

// ─── Notional Row ─────────────────────────────────────────────────────────────

function NotionalRow({ notional, setNotional }: { notional: string; setNotional: (v: string) => void }) {
  const setFraction = (pct: number) => {
    setNotional((MAX_NOTIONAL_MM * pct / 100).toFixed(2));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label style={fieldLabel}>Notional</Label>
      <SuffixInput value={notional} onChange={setNotional} suffix="MM" placeholder="Face amount" />
      <div style={{ display: 'flex', gap: 4 }}>
        {[25, 50, 75, 100].map((pct) => (
          <Button key={pct} variant="outline" size="sm" onClick={() => setFraction(pct)}
            style={{ flex: 1, fontSize: 'var(--ds-font-size-2xs)', padding: '2px 0',
              borderColor: 'var(--ds-border-primary)', color: 'var(--ds-text-muted)' }}>
            {pct}%
          </Button>
        ))}
      </div>
    </div>
  );
}

// ─── Price / Stop Row ─────────────────────────────────────────────────────────

function PriceRow({ orderType, price, setPrice, stop, setStop, quote }: {
  orderType: OrderType; price: string; setPrice: (v: string) => void;
  stop: string; setStop: (v: string) => void; quote: Quote;
}) {
  if (orderType === 'market') return null;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Label style={{ ...fieldLabel, display: 'flex', justifyContent: 'space-between' }}>
          <span>Limit Price</span>
          <span style={{ color: 'var(--ds-text-faint)', fontFamily: 'var(--ds-font-mono)', textTransform: 'none', letterSpacing: 0 }}>YTM {fmtYield(quote.ytm)}</span>
        </Label>
        <SuffixInput value={price} onChange={setPrice} suffix="USD" />
      </div>
      {orderType === 'stop-limit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Label style={fieldLabel}>Stop Price</Label>
          <SuffixInput value={stop} onChange={setStop} suffix="USD" />
        </div>
      )}
    </>
  );
}

// ─── Order Summary Box ────────────────────────────────────────────────────────

function OrderSummary({ side, notional, ticker, orderType, tif, price, estTotal }: {
  side: Side; notional: string; ticker: string; orderType: OrderType; tif: Tif; price: string; estTotal: number;
}) {
  const sideColor = side === 'buy' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)';
  const typeLabel = { limit: 'LMT', market: 'MKT', 'stop-limit': 'STP-LMT' }[orderType];
  const tifLabel = tif.toUpperCase();
  return (
    <div style={{
      background: 'var(--ds-surface-sunken)', border: '1px solid var(--ds-border-primary)',
      borderLeft: `3px solid ${sideColor}`,
      borderRadius: 'var(--ds-radius-md)', padding: '8px 10px',
      fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-muted)',
      fontFamily: 'var(--ds-font-mono)',
    }}>
      <span style={{ color: sideColor, fontWeight: 700 }}>{side.toUpperCase()}</span>
      {' '}{notional}MM {ticker.split(' ')[0]} · {typeLabel} · {tifLabel}
      {orderType !== 'market' && <span> @ {price}</span>}
      <div style={{ marginTop: 4, color: 'var(--ds-text-secondary)' }}>
        Est. total: <strong style={{ color: 'var(--ds-text-primary)' }}>
          {estTotal > 0 ? `$${(estTotal * 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
        </strong>
      </div>
    </div>
  );
}

// ─── CTA Button ───────────────────────────────────────────────────────────────

function CtaButton({ side, notional, ticker, onClick }: {
  side: Side; notional: string; ticker: string; onClick: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--ds-border-primary)', flexShrink: 0 }}>
      <button
        onClick={onClick}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', padding: '10px', borderRadius: 'var(--ds-radius-md)',
          background: side === 'buy' ? 'var(--ds-action-buy-bg)' : 'var(--ds-action-sell-bg)',
          color: side === 'buy' ? 'var(--ds-action-buy-fg)' : 'var(--ds-action-sell-fg)',
          border: 'none', cursor: 'pointer', fontWeight: 700,
          fontSize: 'var(--ds-font-size-sm)', fontFamily: 'var(--ds-font-sans)',
          letterSpacing: '0.02em',
          outline: focused ? '2px solid var(--ds-state-focus-ring)' : 'none',
          outlineOffset: focused ? '2px' : undefined,
        }}
      >
        {side === 'buy' ? 'Buy' : 'Sell'} {notional}MM {ticker.split(' ')[0]}
      </button>
    </div>
  );
}

// ─── Main TradeTicket ─────────────────────────────────────────────────────────

export function TradeTicket({ instrument, quote, onClose = () => undefined }: TradeTicketProps) {
  const [side, setSide] = useState<Side>('buy');
  const [orderType, setOrderType] = useState<OrderType>('limit');
  const [notional, setNotional] = useState('1.00');
  const [price, setPrice] = useState(fmtPrice(quote.mid));
  const [stop, setStop] = useState(fmtPrice(quote.mid - 0.5));
  const [tif, setTif] = useState<Tif>('gtc');

  const estTotal = orderType !== 'market' && price
    ? parseFloat(notional) * parseFloat(price) / 100
    : parseFloat(notional);

  const handleSubmit = () => {
    const typeLabel = { limit: 'Limit', market: 'Market', 'stop-limit': 'Stop-Limit' }[orderType];
    toast({
      title: `${side === 'buy' ? 'Buy' : 'Sell'} order submitted`,
      description: `${notional}MM ${instrument.ticker.split(' ')[0]} · ${typeLabel} ${orderType !== 'market' ? `@ ${price}` : ''} · ${tif.toUpperCase()}`,
    });
    onClose();
  };

  return (
    <div data-testid="trade-ticket" style={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--ds-text-primary)' }}>
      <SecurityHeader instrument={instrument} quote={quote} />
      <BidAskStrip quote={quote} onPickPrice={(p) => setPrice(fmtPrice(p))} />

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 12px' }}>
        {/* Buy/Sell — conviction selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Label style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-secondary)' }}>Side</Label>
          <SideSelector value={side} onChange={setSide} />
        </div>

        {/* Order type tabs */}
        <Tabs value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
          <TabsList className="w-full" style={{ background: 'var(--ds-surface-sunken)' }}>
            <TabsTrigger value="limit" style={{ flex: 1, fontSize: 'var(--ds-font-size-xs)' }}>Limit</TabsTrigger>
            <TabsTrigger value="market" style={{ flex: 1, fontSize: 'var(--ds-font-size-xs)' }}>Market</TabsTrigger>
            <TabsTrigger value="stop-limit" style={{ flex: 1, fontSize: 'var(--ds-font-size-xs)' }}>Stop-Limit</TabsTrigger>
          </TabsList>
          <TabsContent value="limit" />
          <TabsContent value="market" />
          <TabsContent value="stop-limit" />
        </Tabs>

        {/* Notional */}
        <NotionalRow notional={notional} setNotional={setNotional} />

        {/* Price / Stop */}
        <PriceRow orderType={orderType} price={price} setPrice={setPrice} stop={stop} setStop={setStop} quote={quote} />

        {/* TIF */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Label style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-secondary)' }}>Time-in-Force</Label>
          <ToggleGroup type="single" value={tif} onValueChange={(v) => v && setTif(v as Tif)} className="justify-start w-full">
            {(['gtc', 'ioc', 'fok', 'day'] as Tif[]).map((t) => (
              <ToggleGroupItem key={t} value={t} style={{ flex: 1, fontSize: 'var(--ds-font-size-2xs)' }}>
                {t.toUpperCase()}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Order summary */}
        <OrderSummary
          side={side} notional={notional} ticker={instrument.ticker}
          orderType={orderType} tif={tif} price={price} estTotal={estTotal}
        />
      </div>

      <CtaButton side={side} notional={notional} ticker={instrument.ticker} onClick={handleSubmit} />
    </div>
  );
}
