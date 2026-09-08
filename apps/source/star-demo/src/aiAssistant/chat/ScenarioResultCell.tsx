/**
 * A scenario result, rendered as something a trader can read at a glance.
 *
 * Three views behind one payload, because they answer three different
 * questions and a single generic layout would serve none of them well:
 *
 *  - **scan** — the distribution over forked worlds, as a histogram with the
 *    losing tail shaded, plus the worst world's factor path and attribution.
 *  - **worst-move** — the reverse-stress answer: the move itself in the
 *    factors' own units, what it costs, and why this book is exposed to it.
 *  - **fork** — one counterfactual against the history it replaced.
 *
 * The histogram is drawn here rather than through the chart vocabulary because
 * what makes it legible is the shading at the fifth percentile and the zero
 * line, neither of which a generic bar chart puts in. It is a few dozen divs.
 *
 * Everything is a design-system token — no hardcoded colour — so it reads
 * correctly under both themes. Loss and gain use the same two semantic colours
 * the blotter already uses for a down and an up tick, so the polarity is the
 * one the user has already learnt.
 */
import { cn } from '@wellsfargo-starui/react';
import type { ScenarioCellPayload } from '../scenarioTools';
import type { BucketContribution, PositionContribution } from '../scenarioClient';

const MM = 1_000_000;

function mm(value: number): string {
  const millions = value / MM;
  const sign = millions < 0 ? '−' : '+';
  return `${sign}$${Math.abs(millions).toFixed(1)}mm`;
}

function toneOf(value: number): string {
  return value < 0 ? 'text-[color:var(--ds-negative,#c2410c)]' : 'text-[color:var(--ds-positive,#15803d)]';
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-[11px] tabular-nums', tone)}>{value}</span>
    </div>
  );
}

/**
 * The distribution, with the losing tail called out.
 *
 * A P&L histogram whose fifth percentile is not marked is just a shape; the
 * whole reason to look at it is where the tail starts and how long it runs.
 */
function Distribution({
  bins, var95,
}: {
  bins: { from: number; to: number; count: number }[];
  var95: number;
}) {
  if (bins.length === 0) return null;
  const peak = Math.max(...bins.map((bin) => bin.count), 1);
  return (
    <div className="flex items-end gap-px h-16 px-2.5 pt-2" role="img" aria-label="Distribution of outcomes across forked worlds">
      {bins.map((bin) => {
        const inTail = bin.to <= var95;
        const losing = bin.to <= 0;
        return (
          <div
            key={`${bin.from}`}
            title={`${mm(bin.from)} to ${mm(bin.to)}: ${bin.count} world${bin.count === 1 ? '' : 's'}`}
            className={cn(
              'flex-1 rounded-t-[1px] min-h-[1px]',
              inTail
                ? 'bg-[color:var(--ds-negative,#c2410c)]'
                : losing
                  ? 'bg-[color:var(--ds-negative,#c2410c)]/35'
                  : 'bg-[color:var(--ds-positive,#15803d)]/45',
            )}
            style={{ height: `${Math.max(2, (bin.count / peak) * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

function Buckets({ buckets }: { buckets: readonly BucketContribution[] }) {
  const widest = Math.max(...buckets.map((bucket) => Math.abs(bucket.pnl)), 1);
  return (
    <div className="flex flex-col gap-0.5 px-2.5 py-1.5">
      {buckets.slice(0, 6).map((bucket) => (
        <div key={bucket.bucket} className="flex items-center gap-2">
          <span className="w-16 shrink-0 truncate text-[10px] text-muted-foreground">{bucket.bucket}</span>
          <div className="relative h-2 flex-1 rounded-sm bg-muted/40">
            <div
              className={cn(
                'absolute inset-y-0 rounded-sm',
                bucket.pnl < 0
                  ? 'right-1/2 bg-[color:var(--ds-negative,#c2410c)]/70'
                  : 'left-1/2 bg-[color:var(--ds-positive,#15803d)]/70',
              )}
              style={{ width: `${(Math.abs(bucket.pnl) / widest) * 50}%` }}
            />
            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
          </div>
          <span className={cn('w-16 shrink-0 text-right font-mono text-[10px] tabular-nums', toneOf(bucket.pnl))}>
            {mm(bucket.pnl)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Positions({ positions }: { positions: readonly PositionContribution[] }) {
  return (
    <div className="flex flex-col gap-px px-2.5 pb-2">
      {positions.slice(0, 5).map((position) => (
        <div key={position.positionId} className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[10px] text-foreground/80">{position.description}</span>
          <span className={cn('shrink-0 font-mono text-[10px] tabular-nums', toneOf(position.pnl))}>
            {mm(position.pnl)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-1.5 text-[9px] uppercase tracking-wide text-muted-foreground">{children}</div>
  );
}

export function ScenarioResultCell({ payload }: { payload: ScenarioCellPayload }) {
  const { scan, worstMove, fork } = payload;
  const title =
    payload.view === 'scan' ? 'Forked worlds'
      : payload.view === 'worst-move' ? 'Worst plausible move'
        : `Counterfactual — ${fork?.name ?? ''}`;

  return (
    <div className="w-full rounded-lg border border-border/60 overflow-hidden">
      <div className="flex items-baseline gap-2 px-2.5 py-1.5 border-b border-border/60 bg-muted/20">
        <span className="font-mono text-[11px] text-foreground/90">{title}</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
          {payload.headline}
        </span>
        {payload.elapsedMs !== undefined && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {payload.elapsedMs}ms
          </span>
        )}
      </div>

      {scan !== undefined && (
        <>
          <Distribution bins={scan.distribution} var95={scan.var95} />
          <div className="grid grid-cols-5 gap-2 px-2.5 py-1.5 border-b border-border/60">
            <Stat label="best" value={mm(scan.best)} tone={toneOf(scan.best)} />
            <Stat label="median" value={mm(scan.median)} tone={toneOf(scan.median)} />
            <Stat label="5th %ile" value={mm(scan.var95)} tone={toneOf(scan.var95)} />
            <Stat label="shortfall" value={mm(scan.cvar95)} tone={toneOf(scan.cvar95)} />
            <Stat label="worst" value={mm(scan.worst)} tone={toneOf(scan.worst)} />
          </div>
          {scan.worstWorlds[0] !== undefined && (
            <>
              <SectionLabel>
                worst world · 10Y {scan.worstWorlds[0].tenYearFrom.toFixed(2)}% →{' '}
                {scan.worstWorlds[0].tenYearTo.toFixed(2)}% · {scan.worstWorlds[0].downgrades} downgrades ·{' '}
                {scan.worstWorlds[0].creditJumps} spread jumps
              </SectionLabel>
              <Buckets buckets={scan.worstWorlds[0].byBucket} />
              <SectionLabel>hardest hit</SectionLabel>
              <Positions positions={scan.worstWorlds[0].worstPositions} />
            </>
          )}
        </>
      )}

      {worstMove !== undefined && (
        <>
          <div className="grid grid-cols-4 gap-2 px-2.5 py-1.5 border-b border-border/60">
            <Stat label="10Y" value={`${worstMove.tenYearMoveBp >= 0 ? '+' : ''}${worstMove.tenYearMoveBp.toFixed(0)}bp`} />
            <Stat label="credit" value={`${worstMove.creditWideningPct >= 0 ? '+' : ''}${worstMove.creditWideningPct.toFixed(0)}%`} />
            <Stat label="cost" value={mm(worstMove.actualPnl)} tone={toneOf(worstMove.actualPnl)} />
            <Stat
              label="convexity"
              value={mm(worstMove.convexityEffect)}
              tone={toneOf(worstMove.convexityEffect)}
            />
          </div>
          <p className="px-2.5 py-1.5 text-[10px] leading-snug text-muted-foreground border-b border-border/60">
            {worstMove.explanation}
          </p>
          <SectionLabel>where it lands</SectionLabel>
          <Buckets buckets={worstMove.byBucket} />
          <SectionLabel>hardest hit</SectionLabel>
          <Positions positions={worstMove.worstPositions} />
        </>
      )}

      {fork !== undefined && (
        <>
          <div className="grid grid-cols-3 gap-2 px-2.5 py-1.5 border-b border-border/60">
            <Stat label="actual" value={mm(fork.actual.median)} tone={toneOf(fork.actual.median)} />
            <Stat
              label="counterfactual"
              value={mm(fork.counterfactual.median)}
              tone={toneOf(fork.counterfactual.median)}
            />
            <Stat label="difference" value={mm(fork.difference.median)} tone={toneOf(fork.difference.median)} />
          </div>
          {fork.counterfactual.worstWorlds[0] !== undefined && (
            <>
              <SectionLabel>
                in the counterfactual · 10Y {fork.counterfactual.worstWorlds[0].tenYearFrom.toFixed(2)}% →{' '}
                {fork.counterfactual.worstWorlds[0].tenYearTo.toFixed(2)}%
              </SectionLabel>
              <Buckets buckets={fork.counterfactual.worstWorlds[0].byBucket} />
            </>
          )}
        </>
      )}

      <p className="px-2.5 py-1.5 border-t border-border/60 bg-muted/10 text-[9px] leading-snug text-muted-foreground">
        {payload.plausibility} · book {payload.bookFingerprint}
      </p>
    </div>
  );
}
