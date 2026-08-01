import type { WidgetProps } from '@widgetstools/react-dock-manager';
import {
  Card, CardContent, CardHeader, CardTitle,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@wellsfargo-starui/react';
import { BOOK_RISK, SEED_INSTRUMENTS } from '../../data/seeds';
import { fmtMoney } from '../../data/formatters';

// ── heatmap cell data at module scope ─────────────────────────────────────────

const MAX_OAS = Math.max(...SEED_INSTRUMENTS.map((i) => i.gSpd));

interface HeatCell {
  ticker: string;
  oas: number;
  pct: number;  // 0-70 for color-mix intensity
}

function buildHeatCells(): HeatCell[] {
  return SEED_INSTRUMENTS.map((inst) => ({
    ticker: inst.ticker,
    oas: inst.gSpd,
    pct: Math.round((inst.gSpd / MAX_OAS) * 70),
  }));
}

const HEAT_CELLS = buildHeatCells();

// ── table helpers ─────────────────────────────────────────────────────────────

function pnlColor(pnl: number): string {
  return pnl >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)';
}

// ── component ─────────────────────────────────────────────────────────────────

export function BookRisk(_props: WidgetProps) {
  return (
    <div className="flex h-full flex-col" data-testid="panel-bookRisk">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Book Risk
      </div>
      <div className="min-h-0 flex-1 overflow-auto flex flex-col gap-3 p-3">
        <BookRiskTable />
        <OasHeatmap />
      </div>
    </div>
  );
}

function BookRiskTable() {
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className="text-[11px] uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
          Book Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px]">Book</TableHead>
              <TableHead className="text-right text-[10px]">MV</TableHead>
              <TableHead className="text-right text-[10px]">DV01</TableHead>
              <TableHead className="text-right text-[10px]">OAS (bp)</TableHead>
              <TableHead className="text-right text-[10px]">P&amp;L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {BOOK_RISK.map((row) => (
              <BookRiskRow key={row.book} row={row} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BookRiskRow({ row }: { row: typeof BOOK_RISK[number] }) {
  return (
    <TableRow>
      <TableCell className="text-[11px] font-medium">{row.book}</TableCell>
      <TableCell className="text-right text-[11px] font-[family-name:var(--ds-font-mono)]">
        {fmtMoney(row.mv)}
      </TableCell>
      <TableCell className="text-right text-[11px] font-[family-name:var(--ds-font-mono)]">
        ${row.dv01.toLocaleString('en-US')}
      </TableCell>
      <TableCell className="text-right text-[11px] font-[family-name:var(--ds-font-mono)]">
        {row.oas}
      </TableCell>
      <TableCell
        className="text-right text-[11px] font-[family-name:var(--ds-font-mono)] font-semibold"
        style={{ color: pnlColor(row.pnl) }}
      >
        {row.pnl >= 0 ? '+' : ''}{fmtMoney(row.pnl)}
      </TableCell>
    </TableRow>
  );
}

function OasHeatmap() {
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-3">
        <CardTitle className="text-[11px] uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
          OAS Heatmap — by Instrument
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="grid grid-cols-4 gap-1">
          {HEAT_CELLS.map((cell) => (
            <HeatCell key={cell.ticker} cell={cell} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HeatCell({ cell }: { cell: HeatCell }) {
  return (
    <div
      className="rounded px-1.5 py-1 text-[9px] leading-tight"
      style={{
        background: `color-mix(in srgb, var(--ds-overlay-warning-soft) ${cell.pct}%, transparent)`,
        border: '1px solid var(--ds-border-tertiary)',
      }}
    >
      <div className="font-medium truncate text-[color:var(--ds-text-primary)]">{cell.ticker}</div>
      <div className="text-[color:var(--ds-text-muted)]">{cell.oas}bp</div>
    </div>
  );
}
