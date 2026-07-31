import { useEffect, useReducer, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@wellsfargo-starui/ui';
import { DEALERS, makeRng } from '../data/seeds';
import { rfqReducer, EXPIRY_TICKS } from '../data/rfq';
import type { RfqAction, RfqQuote, RfqRequest, RfqSide } from '../data/rfq';
import { useDemoState } from '../state/DemoStateProvider';
import { SideSelector } from '../components/SideSelector';
import { fmtPrice } from '../data/formatters';

const LADDER_COLS = '64px 88px 64px 88px 64px 60px 70px minmax(120px,1fr)';

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE_PRESETS = [2, 5, 10, 15];
let requestCounter = 0;
function nextId() { return `rfq-${++requestCounter}`; }

// ─── Countdown Ring ───────────────────────────────────────────────────────────

const RING_R = 10;
const RING_C = RING_R + 2;
const RING_SIZE = RING_C * 2;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

function CountdownRing({ ticks }: { ticks: number }) {
  const pct = Math.max(0, 1 - ticks / EXPIRY_TICKS);
  const dashOffset = CIRCUMFERENCE * (1 - pct);
  const color = pct > 0.5
    ? 'var(--ds-accent-positive)'
    : pct > 0.2
      ? 'var(--ds-accent-warning)'
      : 'var(--ds-accent-negative)';

  return (
    <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
      <circle cx={RING_C} cy={RING_C} r={RING_R} fill="none"
        strokeWidth={2} stroke="var(--ds-border-secondary)" />
      <circle cx={RING_C} cy={RING_C} r={RING_R} fill="none"
        strokeWidth={2} stroke={color}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${RING_C} ${RING_C})`} />
    </svg>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: RfqRequest['status'] }) {
  const map: Record<RfqRequest['status'], { label: string; style: React.CSSProperties }> = {
    pending:   { label: 'Pending',   style: { background: 'var(--ds-accent-info)',     color: 'var(--ds-surface-ground)' } },
    quoted:    { label: 'Quoted',    style: { background: 'var(--ds-accent-positive)', color: 'var(--ds-surface-ground)' } },
    done:      { label: 'Done',      style: { background: 'var(--ds-accent-highlight)', color: 'var(--ds-surface-ground)' } },
    cancelled: { label: 'Cancelled', style: { background: 'var(--ds-border-secondary)', color: 'var(--ds-text-muted)' } },
  };
  const { label, style } = map[status];
  return <Badge style={style}>{label}</Badge>;
}

// ─── Dealer Toggle Chips ──────────────────────────────────────────────────────

function DealerChips({ selected, onToggle }: { selected: Set<string>; onToggle: (d: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {DEALERS.map((d) => {
        const active = selected.has(d);
        return (
          <button key={d} onClick={() => onToggle(d)} style={{
            padding: '2px 8px', borderRadius: 'var(--ds-radius-sm)',
            fontSize: 'var(--ds-font-size-xs)', fontFamily: 'var(--ds-font-mono)',
            cursor: 'pointer', border: '1px solid',
            borderColor: active ? 'var(--ds-accent-info)' : 'var(--ds-border-secondary)',
            background: active ? 'var(--ds-accent-info)' : 'transparent',
            color: active ? 'var(--ds-surface-ground)' : 'var(--ds-text-muted)',
          }}>
            {d}
          </button>
        );
      })}
    </div>
  );
}

// ─── History List ─────────────────────────────────────────────────────────────

interface HistoryListProps {
  requests: RfqRequest[];
  selectedReqId: string | null;
  onSelect: (id: string) => void;
  instruments: { id: string; ticker: string }[];
}

function HistoryList({ requests, selectedReqId, onSelect, instruments }: HistoryListProps) {
  const instMap = Object.fromEntries(instruments.map((i) => [i.id, i.ticker]));
  if (requests.length === 0) {
    return (
      <div style={{ padding: '12px 8px', fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-faint)', textAlign: 'center' }}>
        No active RFQs
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {requests.map((req) => {
        const isSelected = req.id === selectedReqId;
        return (
          <button key={req.id} onClick={() => onSelect(req.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px', borderRadius: 'var(--ds-radius-sm)',
            border: '1px solid',
            borderColor: isSelected ? 'var(--ds-accent-info)' : 'var(--ds-border-primary)',
            background: isSelected ? 'var(--ds-state-selection)' : 'transparent',
            cursor: 'pointer', textAlign: 'left',
          }}>
            <CountdownRing ticks={req.ticks} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--ds-font-size-xs)', fontFamily: 'var(--ds-font-mono)', color: 'var(--ds-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {instMap[req.instrumentId] ?? req.instrumentId}
              </div>
              <div style={{ fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-muted)' }}>
                {req.side.toUpperCase()} {req.sizeMM}MM · {req.dealers.length}D
              </div>
            </div>
            <StatusBadge status={req.status} />
          </button>
        );
      })}
    </div>
  );
}

// ─── Best Banner ──────────────────────────────────────────────────────────────

function BestBanner({ req }: { req: RfqRequest }) {
  const liveQuotes = req.quotes.filter((q) => q.status === 'live');
  if (liveQuotes.length === 0) return null;

  const bestBid = Math.max(...liveQuotes.map((q) => q.bid));
  const bestAsk = Math.min(...liveQuotes.map((q) => q.ask));
  const spread = (bestAsk - bestBid) * 100; // cents

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, padding: '8px 10px', background: 'var(--ds-surface-secondary)', borderBottom: '1px solid var(--ds-border-primary)' }}>
      {[
        { label: 'Best Bid', val: fmtPrice(bestBid), color: 'var(--ds-accent-positive)' },
        { label: 'Best Ask', val: fmtPrice(bestAsk), color: 'var(--ds-accent-negative)' },
        { label: 'Spread', val: `${spread.toFixed(2)}c`, color: 'var(--ds-text-secondary)' },
        { label: 'Quotes', val: String(liveQuotes.length), color: 'var(--ds-text-secondary)' },
      ].map(({ label, val, color }) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-muted)', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 'var(--ds-font-size-sm)', fontFamily: 'var(--ds-font-mono)', fontWeight: 700, color }}>{val}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Exec Confirm Banner ──────────────────────────────────────────────────────

function ExecConfirm({ req }: { req: RfqRequest }) {
  if (!req.exec) return null;
  const { dealer, price, action } = req.exec;
  return (
    <div style={{
      margin: '8px 10px', padding: '8px 12px', borderRadius: 'var(--ds-radius-md)',
      background: 'var(--ds-accent-positive)', color: 'var(--ds-surface-ground)',
      fontSize: 'var(--ds-font-size-xs)', fontWeight: 600,
    }}>
      Executed: {action.toUpperCase()} {dealer} @ {fmtPrice(price)}
    </div>
  );
}

// ─── Quote Ladder Row (CSS grid — fits the pane, HIT/LIFT always visible) ──────

interface QuoteRowProps {
  q: RfqQuote;
  isBestBid: boolean;
  isBestAsk: boolean;
  canExecute: boolean;
  onHit: () => void;
  onLift: () => void;
}

const num: React.CSSProperties = { fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-xs)', textAlign: 'right' };

function QuoteRow({ q, isBestBid, isBestAsk, canExecute, onHit, onLift }: QuoteRowProps) {
  const spread = ((q.ask - q.bid) * 100).toFixed(1);
  const rowOpacity = q.status === 'stale' ? 0.4 : q.status === 'done' ? 0.7 : 1;
  const live = canExecute && q.status === 'live';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: LADDER_COLS, alignItems: 'center', columnGap: 8,
      padding: '7px 12px', borderBottom: '1px solid var(--ds-border-primary)', opacity: rowOpacity,
    }}>
      <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-xs)', fontWeight: 600, color: 'var(--ds-text-primary)' }}>{q.dealer}</span>

      <span style={{ ...num, fontWeight: 600, color: 'var(--ds-accent-positive)' }}>
        {isBestBid && <BestTag dir="up" />}{fmtPrice(q.bid)}
      </span>
      <span style={{ ...num, color: 'var(--ds-text-secondary)' }}>${q.bidSizeMM.toFixed(0)}MM</span>

      <span style={{ ...num, fontWeight: 600, color: 'var(--ds-accent-negative)' }}>
        {isBestAsk && <BestTag dir="down" />}{fmtPrice(q.ask)}
      </span>
      <span style={{ ...num, color: 'var(--ds-text-secondary)' }}>${q.askSizeMM.toFixed(0)}MM</span>

      <span style={{ ...num, color: 'var(--ds-accent-warning)' }}>{spread}¢</span>

      <span><LiveTag status={q.status} /></span>

      <span style={{ display: 'flex', justifyContent: 'flex-start', gap: 5 }}>
        {live && (
          <>
            <ActionButton label="HIT" tone="info" onClick={onHit} />
            <ActionButton label="LIFT" tone="positive" onClick={onLift} />
          </>
        )}
      </span>
    </div>
  );
}

function BestTag({ dir }: { dir: 'up' | 'down' }) {
  return (
    <span style={{ marginRight: 4, fontSize: 'var(--ds-font-size-2xs)', fontWeight: 700, color: 'var(--ds-text-muted)', letterSpacing: '0.04em' }}>
      {dir === 'up' ? '▲' : '▼'}BEST
    </span>
  );
}

function LiveTag({ status }: { status: RfqQuote['status'] }) {
  const label = status === 'live' ? 'LIVE' : status === 'done' ? 'DONE' : 'STALE';
  const color = status === 'live' ? 'var(--ds-accent-positive)' : 'var(--ds-text-faint)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: 'var(--ds-radius-sm)',
      border: '1px solid', borderColor: color, color, fontSize: 'var(--ds-font-size-2xs)',
      fontWeight: 600, letterSpacing: '0.06em',
    }}>{label}</span>
  );
}

function ActionButton({ label, tone, onClick }: { label: string; tone: 'info' | 'positive'; onClick: () => void }) {
  const color = tone === 'info' ? 'var(--ds-accent-info)' : 'var(--ds-accent-positive)';
  return (
    <button
      onClick={onClick}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-state-focus-ring)]"
      style={{
        padding: '3px 12px', borderRadius: 'var(--ds-radius-sm)', cursor: 'pointer',
        background: 'transparent', border: '1px solid', borderColor: color, color,
        fontFamily: 'var(--ds-font-sans)', fontSize: 'var(--ds-font-size-2xs)', fontWeight: 700, letterSpacing: '0.05em',
      }}
    >
      {label}
    </button>
  );
}

// ─── Quote Ladder ─────────────────────────────────────────────────────────────

interface QuoteLadderProps {
  req: RfqRequest | null;
  onHit: (dealer: string) => void;
  onLift: (dealer: string) => void;
}

function QuoteLadder({ req, onHit, onLift }: QuoteLadderProps) {
  if (!req) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text-faint)', fontSize: 'var(--ds-font-size-sm)' }}>
        Select an RFQ to view quotes
      </div>
    );
  }

  const liveQuotes = req.quotes.filter((q) => q.status === 'live');
  const bestBid = liveQuotes.length ? Math.max(...liveQuotes.map((q) => q.bid)) : null;
  const bestAsk = liveQuotes.length ? Math.min(...liveQuotes.map((q) => q.ask)) : null;
  const canExecute = req.status === 'quoted';
  const head: React.CSSProperties = { fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <BestBanner req={req} />
      {req.exec && <ExecConfirm req={req} />}

      {/* Column header */}
      <div style={{
        display: 'grid', gridTemplateColumns: LADDER_COLS, columnGap: 8, padding: '7px 12px',
        borderBottom: '1px solid var(--ds-border-primary)',
      }}>
        <span style={head}>Dealer</span>
        <span style={{ ...head, textAlign: 'right' }}>Bid</span>
        <span style={{ ...head, textAlign: 'right' }}>Bid Size</span>
        <span style={{ ...head, textAlign: 'right' }}>Ask</span>
        <span style={{ ...head, textAlign: 'right' }}>Ask Size</span>
        <span style={{ ...head, textAlign: 'right' }}>Spread</span>
        <span style={head}>Status</span>
        <span style={head}>Action</span>
      </div>

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        {req.quotes.length === 0 ? (
          <div style={{ padding: '16px 10px', textAlign: 'center', color: 'var(--ds-text-faint)', fontSize: 'var(--ds-font-size-xs)' }}>
            Awaiting dealer responses…
          </div>
        ) : (
          req.quotes.map((q) => (
            <QuoteRow
              key={q.dealer} q={q}
              isBestBid={bestBid !== null && q.bid === bestBid && q.status === 'live'}
              isBestAsk={bestAsk !== null && q.ask === bestAsk && q.status === 'live'}
              canExecute={canExecute}
              onHit={() => onHit(q.dealer)}
              onLift={() => onLift(q.dealer)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}

// ─── New RFQ Form ─────────────────────────────────────────────────────────────

interface NewRfqFormProps {
  instruments: { id: string; ticker: string }[];
  onSend: (payload: { instrumentId: string; side: RfqSide; sizeMM: number; dealers: string[] }) => void;
}

function NewRfqForm({ instruments, onSend }: NewRfqFormProps) {
  const [instrumentId, setInstrumentId] = useState(instruments[0]?.id ?? '');
  const [side, setSide] = useState<RfqSide>('buy');
  const [sizeMM, setSizeMM] = useState(5);
  const [customSize, setCustomSize] = useState('');
  const [selectedDealers, setSelectedDealers] = useState<Set<string>>(new Set(DEALERS.slice(0, 4)));

  const toggleDealer = (d: string) => {
    setSelectedDealers((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  const effectiveSize = customSize ? parseFloat(customSize) || sizeMM : sizeMM;

  const handleSend = () => {
    if (!instrumentId || selectedDealers.size === 0) return;
    onSend({ instrumentId, side, sizeMM: effectiveSize, dealers: Array.from(selectedDealers) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 10px 6px' }}>
      {/* Instrument */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Label style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-secondary)' }}>Instrument</Label>
        <Select value={instrumentId} onValueChange={setInstrumentId}>
          <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
          <SelectContent>
            {instruments.map((i) => <SelectItem key={i.id} value={i.id}>{i.ticker}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Side */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Label style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-secondary)' }}>Side</Label>
        <SideSelector value={side} onChange={setSide} />
      </div>

      {/* Size */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Label style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-secondary)' }}>Size (MM)</Label>
        <div style={{ display: 'flex', gap: 4 }}>
          {SIZE_PRESETS.map((s) => (
            <Button key={s} size="sm" variant={sizeMM === s && !customSize ? 'default' : 'outline'}
              onClick={() => { setSizeMM(s); setCustomSize(''); }}
              style={{ flex: 1, fontSize: 'var(--ds-font-size-xs)' }}>
              {s}
            </Button>
          ))}
        </div>
        <Input
          inputMode="decimal" placeholder="Custom MM"
          value={customSize}
          onChange={(e) => setCustomSize(e.target.value)}
          style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-sm)' }}
        />
      </div>

      {/* Dealers */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Label style={{ fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-secondary)' }}>Dealers ({selectedDealers.size})</Label>
        <DealerChips selected={selectedDealers} onToggle={toggleDealer} />
      </div>

      {/* Send */}
      <Button onClick={handleSend} disabled={!instrumentId || selectedDealers.size === 0}
        style={{ gap: 6, background: 'var(--ds-accent-info)', color: 'var(--ds-surface-ground)', border: 'none', fontWeight: 700, letterSpacing: '0.04em' }}>
        <Zap size={13} /> Send RFQ
      </Button>
    </div>
  );
}

// ─── Main RfqWorkbench ────────────────────────────────────────────────────────

/** RFQ Workbench — floating panel, opened by Task 6. NOT registered in dock registry. */
export function RfqWorkbench() {
  const { store } = useDemoState();
  const instruments = store.state.instruments;

  // Stable rng instance — deterministic per session
  const rngRef = useRef(makeRng(0xf1f1f1));
  const [requests, dispatch] = useReducer(
    (state: ReturnType<typeof rfqReducer>, action: RfqAction) =>
      rfqReducer(state, action, rngRef.current),
    [],
  );
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

  // Tick interval ~1s
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(id);
  }, []);

  const handleSend = (payload: { instrumentId: string; side: RfqSide; sizeMM: number; dealers: string[] }) => {
    const id = nextId();
    const mid = store.state.quotes[payload.instrumentId]?.mid ?? 100;
    dispatch({ type: 'send', req: { id, mid, ...payload } });
    setSelectedReqId(id);
  };

  const handleHit = (dealer: string) => {
    if (selectedReqId) dispatch({ type: 'hit', id: selectedReqId, dealer });
  };
  const handleLift = (dealer: string) => {
    if (selectedReqId) dispatch({ type: 'lift', id: selectedReqId, dealer });
  };
  const handleClear = () => {
    dispatch({ type: 'clear' });
    setSelectedReqId(null);
  };
  const handleCancel = () => {
    if (selectedReqId) dispatch({ type: 'cancel', id: selectedReqId });
  };

  const selectedReq = requests.find((r) => r.id === selectedReqId) ?? null;
  const selectedTicker = selectedReq
    ? instruments.find((i) => i.id === selectedReq.instrumentId)?.ticker ?? selectedReq.instrumentId
    : '';

  return (
    <div data-testid="rfq-workbench"
      style={{ display: 'flex', height: '100%', background: 'var(--ds-surface-primary)', color: 'var(--ds-text-primary)', fontFamily: 'var(--ds-font-sans)' }}>

      {/* LEFT — form + history */}
      <div style={{ width: 286, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--ds-border-primary)' }}>
        {/* Panel header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--ds-border-primary)', padding: '8px 12px', fontSize: 'var(--ds-font-size-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ds-accent-info)' }}>
          <Zap size={13} /> New RFQ
        </div>

        {/* Form */}
        <NewRfqForm instruments={instruments} onSend={handleSend} />

        {/* History header */}
        <div style={{ borderTop: '1px solid var(--ds-border-primary)', borderBottom: '1px solid var(--ds-border-primary)', padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 'var(--ds-font-size-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ds-text-secondary)' }}>
            Active ({requests.length})
          </span>
          {requests.some((r) => r.status === 'done' || r.status === 'cancelled') && (
            <button onClick={handleClear} style={{ fontSize: 'var(--ds-font-size-2xs)', color: 'var(--ds-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear
            </button>
          )}
        </div>

        <ScrollArea style={{ flex: 1 }}>
          <div style={{ padding: '6px 6px' }}>
            <HistoryList
              requests={requests}
              selectedReqId={selectedReqId}
              onSelect={setSelectedReqId}
              instruments={instruments}
            />
          </div>
        </ScrollArea>
      </div>

      {/* RIGHT — quote ladder */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--ds-border-primary)', padding: '8px 12px', minHeight: 40 }}>
          {selectedReq ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-sm)', fontWeight: 700, color: 'var(--ds-text-primary)' }}>{selectedReq.id.toUpperCase()}</span>
                <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-accent-info)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedTicker}</span>
                <span style={{ fontSize: 'var(--ds-font-size-2xs)', fontWeight: 700, letterSpacing: '0.06em', color: selectedReq.side === 'buy' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)' }}>{selectedReq.side.toUpperCase()}</span>
                <span style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 'var(--ds-font-size-xs)', color: 'var(--ds-text-secondary)' }}>${selectedReq.sizeMM}MM</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {selectedReq.status !== 'done' && selectedReq.status !== 'cancelled' && <CountdownRing ticks={selectedReq.ticks} />}
                {(selectedReq.status === 'pending' || selectedReq.status === 'quoted') && (
                  <button onClick={handleCancel}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-state-focus-ring)]"
                    style={{ padding: '3px 12px', borderRadius: 'var(--ds-radius-sm)', background: 'transparent', border: '1px solid var(--ds-accent-negative)', color: 'var(--ds-accent-negative)', cursor: 'pointer', fontSize: 'var(--ds-font-size-2xs)', fontWeight: 600, letterSpacing: '0.04em' }}>
                    Cancel
                  </button>
                )}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 'var(--ds-font-size-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ds-text-secondary)' }}>Quote Ladder</span>
          )}
        </div>
        <QuoteLadder req={selectedReq} onHit={handleHit} onLift={handleLift} />
      </div>
    </div>
  );
}
