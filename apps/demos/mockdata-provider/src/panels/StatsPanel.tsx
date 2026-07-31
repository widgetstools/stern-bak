import { useEffect, useState, type ReactNode } from 'react';
import { useStats, type SourceStats } from '../state/StatsContext';
import { useMockConfig } from '../state/MockConfigContext';
import { Badge } from '@wellsfargo-starui/ui';
import { Activity, Cog } from 'lucide-react';

export function StatsPanel() {
  const stats = useStats();
  const { cfg } = useMockConfig();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  void tick;
  const direct = stats.read('direct');
  const ds = stats.read('dataservices');

  return (
    <div className="flex h-full w-full items-center gap-6 overflow-x-auto bg-[color:var(--ds-surface-primary)] px-4 py-2 text-[12px] text-[color:var(--ds-text-secondary)]">
      <StatsBlock label="Direct"       icon={<Activity size={12} strokeWidth={1.75} />} s={direct} />
      <Divider />
      <StatsBlock label="DataServices" icon={<Activity size={12} strokeWidth={1.75} />} s={ds} />
      <Divider />
      <ConfigEcho cfg={cfg} />
    </div>
  );
}

function StatsBlock({ label, icon, s }: { label: string; icon: ReactNode; s: SourceStats }) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <Badge className="border-transparent bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-accent-info)]">
        <span className="mr-1 inline-flex">{icon}</span>
        {label}
      </Badge>
      <span className="font-mono text-[11px]">
        <span className="text-[color:var(--ds-text-primary)]">{s.rowCount.toLocaleString()}</span>
        <span className="text-[color:var(--ds-text-faint)]"> rows</span>
      </span>
      <span className="font-mono text-[11px]">
        <span className="text-[color:var(--ds-text-primary)]">{s.ticksPerSec.toFixed(1)}</span>
        <span className="text-[color:var(--ds-text-faint)]"> ticks/s</span>
      </span>
      <span className="font-mono text-[11px]">
        <span className="text-[color:var(--ds-text-faint)]">last </span>
        <span className="text-[color:var(--ds-text-primary)]">{relTime(s.lastTickAt)}</span>
      </span>
    </div>
  );
}

function ConfigEcho({ cfg }: { cfg: ReturnType<typeof useMockConfig>['cfg'] }) {
  return (
    <div className="flex shrink-0 items-center gap-3 font-mono text-[11px]">
      <Badge className="border-transparent bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-text-secondary)]">
        <Cog size={12} strokeWidth={1.75} className="mr-1" />
        Config
      </Badge>
      <span><span className="text-[color:var(--ds-text-faint)]">dataType </span><span className="text-[color:var(--ds-text-primary)]">{cfg.dataType}</span></span>
      <span><span className="text-[color:var(--ds-text-faint)]">rowCount </span><span className="text-[color:var(--ds-text-primary)]">{cfg.rowCount}</span></span>
      <span><span className="text-[color:var(--ds-text-faint)]">interval </span><span className="text-[color:var(--ds-text-primary)]">{cfg.updateIntervalMs}ms</span></span>
      <span><span className="text-[color:var(--ds-text-faint)]">updates </span><span className="text-[color:var(--ds-text-primary)]">{cfg.enableUpdates ? 'on' : 'off'}</span></span>
    </div>
  );
}

function Divider() {
  return <span className="h-4 w-px shrink-0 bg-[color:var(--ds-border-primary)]" />;
}

function relTime(ts: number | null): string {
  if (ts == null) return '—';
  const dms = Date.now() - ts;
  if (dms < 1000) return `${dms}ms ago`;
  if (dms < 60_000) return `${(dms / 1000).toFixed(1)}s ago`;
  return `${Math.floor(dms / 60_000)}m ago`;
}
