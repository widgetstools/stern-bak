import { ScrollArea } from '@wellsfargo-starui/react';
import { useEffect, useState } from 'react';
import { fmtPrice, fmtYield } from '../data/formatters';
import { makeRng, DEALERS } from '../data/seeds';
import { useDemoState } from '../state/DemoStateProvider';

interface Print {
  id: string;
  side: 'buy' | 'sell';
  cpty: string;     // dealer code
  price: number;
  yield: number;
  faceMM: number;
  time: string;     // HH:MM:SS
}

const RING_SIZE = 15;
let printSeq = 1;

function nowTime(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

function generatePrints(
  mid: number,
  ytm: number,
  count: number,
): Print[] {
  const rng = makeRng(Date.now() >>> 0);
  return Array.from({ length: count }, () => {
    const side: 'buy' | 'sell' = rng() < 0.5 ? 'buy' : 'sell';
    const priceDelta = (rng() - 0.5) * 0.15;
    const price = +(mid + priceDelta).toFixed(3);
    const yld = +(ytm - priceDelta * 0.1).toFixed(3);
    const faceMM = +(1 + Math.round(rng() * 14)).toFixed(0);
    const cpty = DEALERS[Math.floor(rng() * DEALERS.length)];
    return {
      id: `p${printSeq++}`,
      side,
      cpty,
      price,
      yield: yld,
      faceMM: Number(faceMM),
      time: nowTime(),
    };
  });
}

// ── PrintRow ─────────────────────────────────────────────────────────────────

function PrintRow({ print }: { print: Print }) {
  const sideColor = print.side === 'buy'
    ? 'var(--ds-accent-positive)'
    : 'var(--ds-accent-negative)';

  return (
    <tr
      className="border-b border-[color:var(--ds-border-primary)] hover:bg-[color:var(--ds-state-hover-overlay)]"
      style={{ fontFamily: 'var(--ds-font-mono)', fontSize: 11 }}
    >
      <td className="px-2 py-0.5 font-semibold" style={{ color: sideColor }}>
        {print.side.toUpperCase()}
      </td>
      <td className="px-2 py-0.5 text-[color:var(--ds-text-secondary)]">{print.cpty}</td>
      <td className="px-2 py-0.5 text-right text-[color:var(--ds-text-primary)]">
        {fmtPrice(print.price)}
      </td>
      <td className="px-2 py-0.5 text-right text-[color:var(--ds-text-secondary)]">
        {fmtYield(print.yield)}
      </td>
      <td className="px-2 py-0.5 text-right text-[color:var(--ds-text-secondary)]">
        {print.faceMM}MM
      </td>
      <td className="px-2 py-0.5 text-right text-[color:var(--ds-text-secondary)]">
        {print.time}
      </td>
    </tr>
  );
}

// ── PrintsTableHeader ─────────────────────────────────────────────────────────

function PrintsTableHeader() {
  return (
    <thead>
      <tr
        className="border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
        style={{ fontSize: 10 }}
      >
        {['Side', 'Cpty', 'Price', 'Yield', 'Face', 'Time'].map((col) => (
          <th
            key={col}
            className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]"
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ── RecentPrints ─────────────────────────────────────────────────────────────

export function RecentPrints() {
  const { store, selectedId } = useDemoState();
  const state = store.state;

  const inst = state.instruments.find((i) => i.id === selectedId) ?? state.instruments[0];
  const quote = inst ? state.quotes[inst.id] : undefined;

  const [prints, setPrints] = useState<Print[]>(() => {
    if (!inst || !quote) return [];
    return generatePrints(quote.mid, quote.ytm, RING_SIZE);
  });

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!inst || !quote) return;
      const newOnes = generatePrints(quote.mid, quote.ytm, 1 + (Math.random() < 0.4 ? 1 : 0));
      setPrints((prev) => [...newOnes, ...prev].slice(0, RING_SIZE));
    }, 3000);

    return () => clearInterval(intervalId);
  }, [inst, quote]);

  return (
    <div className="flex h-full flex-col" data-testid="recent-prints">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold text-[color:var(--ds-text-secondary)]">
        {inst ? `Recent Prints — ${inst.ticker}` : 'Recent Prints'}
      </div>
      <ScrollArea className="flex-1">
        <table className="w-full">
          <PrintsTableHeader />
          <tbody>
            {prints.map((p) => (
              <PrintRow key={p.id} print={p} />
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
