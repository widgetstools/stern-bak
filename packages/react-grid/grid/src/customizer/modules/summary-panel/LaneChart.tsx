/**
 * Several measures stacked as separate tracks over ONE shared axis.
 *
 * The alignment is the entire point. Any one of these lanes is a chart you
 * could already draw; drawn against a common axis, a spike in one lane lines
 * up with a gap in another and the reader sees the connection without being
 * told about it.
 *
 * Hand-drawn SVG rather than one recharts instance per lane, for two reasons
 * that both come back to alignment: eight independent charts each compute
 * their own plot area from their own axis labels, so their x positions drift
 * apart by a few pixels and the whole premise quietly breaks; and every lane
 * here shares a single `0 0 1000 h` viewBox, so a given row index is at the
 * same x in every lane by construction, at any container width.
 *
 * `preserveAspectRatio="none"` lets the tracks stretch to the panel while
 * `vector-effect="non-scaling-stroke"` keeps strokes hairline-crisp. Text
 * would distort under that scaling, so every label lives in HTML in the
 * margin — which is where the reference puts them anyway.
 *
 * Trusted code selected by name, like every other chart kind: the model
 * chooses lanes and columns, never drawing instructions.
 */
import { useId, useMemo } from 'react';
import { formatCompact, type LaneDef, type LaneTone } from '@wellsfargo-starui/data';

/** Lanes name a colour ROLE; only this map knows a token. */
const TONE_VAR: Record<LaneTone, string> = {
  'ramp-1': 'var(--ds-chart-1)',
  'ramp-2': 'var(--ds-chart-2)',
  'ramp-3': 'var(--ds-chart-3)',
  'ramp-4': 'var(--ds-chart-4)',
  'ramp-5': 'var(--ds-chart-5)',
  positive: 'var(--ds-accent-positive)',
  negative: 'var(--ds-accent-negative)',
};

function toneVar(tone: LaneTone | undefined): string {
  return TONE_VAR[tone ?? 'ramp-1'] ?? TONE_VAR['ramp-1'];
}

/** The SVG user-space width every lane shares. Real width comes from CSS. */
const VB_W = 1000;
/** Track height for `weight: 1`. */
const UNIT_H = 46;
/** About as many division rules as read as structure rather than as noise. */
const MAX_DIVISIONS = 12;

export interface LaneChartProps {
  rows: Array<Record<string, unknown>>;
  /** Column every lane is plotted against. */
  axis: string;
  lanes: LaneDef[];
}

interface LaneScale {
  min: number;
  max: number;
  values: number[];
}

function scaleFor(rows: Array<Record<string, unknown>>, column: string): LaneScale {
  const values = rows.map((r) => {
    const v = r[column];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  });
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  // A flat lane would divide by zero; give it a unit range so it draws along
  // its own baseline instead of vanishing.
  return { min, max: max === min ? min + 1 : max, values };
}

/** Row index to shared user-space x. */
function xAt(index: number, count: number): number {
  if (count <= 1) return VB_W / 2;
  return (index / (count - 1)) * VB_W;
}

/** Evenly spaced row indices to rule and label, always including the ends. */
function divisionsFor(count: number): number[] {
  if (count <= 1) return [0];
  const step = Math.max(1, Math.ceil(count / MAX_DIVISIONS));
  const out: number[] = [];
  for (let i = 0; i < count; i += step) out.push(i);
  if (out[out.length - 1] !== count - 1) out.push(count - 1);
  return out;
}

export function LaneChart({ rows, axis, lanes }: LaneChartProps) {
  const clipId = useId();
  const count = rows.length;
  const divisions = useMemo(() => divisionsFor(count), [count]);
  const scales = useMemo(
    () => lanes.map((lane) => scaleFor(rows, lane.column)),
    [rows, lanes],
  );

  if (count === 0 || lanes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4">Nothing to plot — the query returned no rows.</p>
    );
  }

  const axisLabels = divisions.map((i) => String(rows[i]?.[axis] ?? ''));

  return (
    <div className="w-full">
      {lanes.map((lane, li) => {
        const scale = scales[li];
        const height = UNIT_H * (lane.weight ?? 1);
        const color = toneVar(lane.tone);
        return (
          <div
            key={`${lane.column}-${li}`}
            className="grid items-stretch border-b border-border/25 last:border-b-0"
            // The label margin is a fixed column so every track starts at the
            // same x — the same reason the viewBox is shared.
            style={{ gridTemplateColumns: '104px 1fr' }}
          >
            <div className="flex flex-col justify-center pr-3 py-1 text-right">
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground leading-tight">
                {lane.label}
              </span>
              <span className="text-[9px] font-mono text-muted-foreground/60 tabular-nums leading-tight">
                {formatCompact(scale.max)}
              </span>
            </div>
            <svg
              viewBox={`0 0 ${VB_W} ${height}`}
              preserveAspectRatio="none"
              className="w-full block"
              style={{ height }}
              role="img"
              aria-label={`${lane.label} by ${axis}`}
            >
              {/* Drawn per-lane at identical x positions, so the rules line up
                  down the whole stack and make the alignment legible. */}
              {divisions.map((d) => (
                <line
                  key={d}
                  x1={xAt(d, count)}
                  x2={xAt(d, count)}
                  y1={0}
                  y2={height}
                  stroke="var(--ds-border-secondary)"
                  strokeOpacity={0.25}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <LaneMarks
                lane={lane}
                scale={scale}
                rows={rows}
                height={height}
                color={color}
                clipId={`${clipId}-${li}`}
              />
            </svg>
          </div>
        );
      })}

      {/* The shared axis, once, under every lane. */}
      <div className="grid" style={{ gridTemplateColumns: '104px 1fr' }}>
        <span />
        <div className="relative h-5 mt-1 border-t border-border/40">
          {divisions.map((d, i) => (
            <span
              key={d}
              className="absolute top-1 text-[9px] font-mono text-muted-foreground/70 whitespace-nowrap"
              style={{
                left: `${(xAt(d, count) / VB_W) * 100}%`,
                // The first and last labels would overhang the track; pull
                // them inside so the axis reads end to end.
                transform:
                  i === 0 ? 'translateX(0)' : i === divisions.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {axisLabels[i]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function LaneMarks({
  lane,
  scale,
  rows,
  height,
  color,
  clipId,
}: {
  lane: LaneDef;
  scale: LaneScale;
  rows: Array<Record<string, unknown>>;
  height: number;
  color: string;
  clipId: string;
}) {
  const count = scale.values.length;
  const span = scale.max - scale.min;
  // Inset so a peak at the maximum is not clipped by the lane's own edge.
  const pad = 3;
  const yAt = (v: number) => height - pad - ((v - scale.min) / span) * (height - pad * 2);

  if (lane.mark === 'state') {
    // A categorical track: runs of the same value become one block, which is
    // how a reader sees "at the desk all afternoon" as a single fact rather
    // than as forty adjacent samples.
    const runs: Array<{ from: number; to: number; label: string }> = [];
    for (let i = 0; i < count; i++) {
      const label = String(rows[i]?.[lane.column] ?? '');
      const last = runs[runs.length - 1];
      if (last && last.label === label) last.to = i;
      else runs.push({ from: i, to: i, label });
    }
    return (
      <g>
        {runs
          .filter((r) => r.label)
          .map((r) => {
            const x = xAt(r.from, count);
            const w = Math.max(1, xAt(r.to, count) - x);
            return (
              <rect
                key={`${r.from}-${r.label}`}
                x={x}
                y={pad}
                width={w}
                height={height - pad * 2}
                fill={color}
                fillOpacity={0.55}
              />
            );
          })}
      </g>
    );
  }

  if (lane.mark === 'bars') {
    // Widened slightly so a dense series reads as a solid mass rather than as
    // a comb of hairlines, which is what the reference's step lane does.
    const w = Math.max(VB_W / Math.max(count, 1) - 1, 0.8);
    const zeroY = yAt(Math.max(scale.min, 0));
    return (
      <g>
        {scale.values.map((v, i) => {
          const y = yAt(v);
          return (
            <rect
              key={i}
              x={xAt(i, count) - w / 2}
              y={Math.min(y, zeroY)}
              width={w}
              height={Math.max(0.5, Math.abs(zeroY - y))}
              fill={color}
              fillOpacity={0.85}
            />
          );
        })}
      </g>
    );
  }

  const d = scale.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i, count)} ${yAt(v)}`).join(' ');

  if (lane.mark === 'area') {
    const baseY = yAt(Math.max(scale.min, 0));
    return (
      <g>
        <defs>
          <linearGradient id={clipId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.38} />
            <stop offset="100%" stopColor={color} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <path d={`${d} L${xAt(count - 1, count)} ${baseY} L${xAt(0, count)} ${baseY} Z`} fill={`url(#${clipId})`} />
        <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** Exported so a caller can label a lane in its own colour. */
export function laneToneVar(tone: LaneTone | undefined): string {
  return toneVar(tone);
}
