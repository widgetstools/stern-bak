import { Activity, Plus, MessageSquare, Save, RotateCcw } from 'lucide-react';
import { Badge, Button } from '@wellsfargo-starui/ui';
import type { TerminalState } from '../data/types';
import { fmtPrice, fmtSignedPct } from '../data/formatters';
import { ThemeToggle } from './ThemeToggle';

const STRIP_IDS = ['i01', 'i03', 'i05', 'i07', 'i15'];

export interface TopBarProps {
  state: TerminalState;
  onNewOrder?: () => void;
  onRfq?: () => void;
  onSave?: () => void;
  onReset?: () => void;
}

export function TopBar({ state, onNewOrder, onRfq, onSave, onReset }: TopBarProps) {
  return (
    <header
      className="flex h-14 shrink-0 items-center gap-4 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-5 pr-3"
      data-testid="ds-topbar"
    >
      <div className="flex items-center gap-2">
        <span className="inline-block h-5 w-1.5 rounded-sm bg-[color:var(--ds-accent-info)]" aria-hidden />
        <h1 className="text-[15px] font-semibold tracking-tight">StarUI FI Terminal</h1>
        <Badge
          variant="outline"
          className="ml-1 gap-1 border-[color:var(--ds-border-primary)] text-[10px] text-[color:var(--ds-text-secondary)]"
        >
          <Activity size={11} /> design-system demo
        </Badge>
      </div>

      <div className="ml-2 hidden min-w-0 flex-1 items-center gap-4 overflow-hidden lg:flex">
        {STRIP_IDS.map((id) => {
          const q = state.quotes[id];
          const inst = state.instruments.find((i) => i.id === id);
          if (!q || !inst) return null;
          const up = q.changePct >= 0;
          return (
            <div key={id} className="flex items-center gap-1.5 whitespace-nowrap font-[var(--ds-font-mono)] text-[12px]">
              <span className="text-[color:var(--ds-text-secondary)]">{inst.ticker.split(' ')[0]}</span>
              <span className="text-[color:var(--ds-text-primary)]">{fmtPrice(q.mid)}</span>
              <span style={{ color: up ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)' }}>
                {fmtSignedPct(q.changePct)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onNewOrder}
          data-testid="topbar-new-order"
          className="gap-1.5 border-[color:var(--ds-border-primary)] text-[12px] text-[color:var(--ds-text-secondary)] hover:text-[color:var(--ds-text-primary)]"
        >
          <Plus size={13} />
          New Order
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRfq}
          data-testid="topbar-rfq"
          className="gap-1.5 border-[color:var(--ds-border-primary)] text-[12px] text-[color:var(--ds-text-secondary)] hover:text-[color:var(--ds-text-primary)]"
        >
          <MessageSquare size={13} />
          RFQ
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onSave}
          data-testid="topbar-save"
          aria-label="Save layout"
          className="h-8 w-8 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text-primary)]"
        >
          <Save size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          data-testid="topbar-reset"
          aria-label="Reset layout"
          className="h-8 w-8 text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text-primary)]"
        >
          <RotateCcw size={14} />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
