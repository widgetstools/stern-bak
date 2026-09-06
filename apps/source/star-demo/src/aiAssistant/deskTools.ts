/**
 * What the desk is, and what it is not allowed to do.
 *
 * Every conversation started cold. The assistant knew the shape of the data but
 * nothing about the person reading it — no mandate, no benchmark, no limits — so
 * it could report "IG Credit is 4.2% of the book" and had no way to know that
 * 4.2% is 20bp through a cap. Answers were arithmetically right and
 * professionally useless.
 *
 * Two pieces:
 *   - **Context** (mandate, benchmark) is free text, stored once and injected
 *     into the system prompt. It changes the character of every answer without
 *     any tool being called.
 *   - **Limits** are structured, because a limit has to be CHECKED, not
 *     described. Each is evaluated by `runQuery` over real rows — the same
 *     engine every other number goes through — so a breach is a computed fact,
 *     never the model's estimate.
 *
 * Limits are deliberately advisory. Nothing here blocks a trade or edits data;
 * this is a desk's own note of its rules, and a breach is a finding to show
 * someone. It is not a compliance control and must not be described as one.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import { runQuery, type AggFn } from '@wellsfargo-starui/data';
import { blotterEntries, gatherRows, resolveAcross, SOURCE_COLUMN, type PortfolioDeps } from './portfolioTools';
import type { CatalogColumn } from './columnResolver';
import type { ToolExecutionResult } from './toolResult';

const DESK_COMPONENT_TYPE = 'markets-desk-context';
const DESK_CONFIG_ID = `desk-context::${LOGGED_IN_USER_ID}`;

const AGG_FNS: AggFn[] = ['sum', 'avg', 'min', 'max', 'count', 'countDistinct'];

export interface DeskLimit {
  id: string;
  name: string;
  /** Column being measured, e.g. `marketValue`. */
  metric: string;
  /** How the metric is rolled up. Default `sum`. */
  aggregate: AggFn;
  /** Optional per-group limit — `issuer` makes it a per-issuer cap. */
  groupBy?: string;
  /** `absolute` compares the rolled-up number; `percentOfTotal` its share. */
  unit: 'absolute' | 'percentOfTotal';
  max?: number;
  min?: number;
  /** Restrict to these blotters. Omitted means every one. */
  gridIds?: string[];
}

export interface DeskContext {
  mandate?: string;
  benchmark?: string;
  limits: DeskLimit[];
}

const EMPTY: DeskContext = { limits: [] };

export async function readDeskContext(configManager: ConfigManager): Promise<DeskContext> {
  const row = await configManager.getConfig(DESK_CONFIG_ID);
  if (!row) return EMPTY;
  const payload = row.payload as unknown as Partial<DeskContext> | null;
  return {
    mandate: payload?.mandate,
    benchmark: payload?.benchmark,
    limits: Array.isArray(payload?.limits) ? payload.limits : [],
  };
}

async function writeDeskContext(configManager: ConfigManager, next: DeskContext): Promise<void> {
  const now = new Date().toISOString();
  const existing = await configManager.getConfig(DESK_CONFIG_ID);
  await configManager.saveConfig({
    configId: DESK_CONFIG_ID,
    appId: existing?.appId ?? 'Star-Demo',
    userId: LOGGED_IN_USER_ID,
    isPublic: existing?.isPublic ?? true,
    displayText: 'Desk context',
    componentType: DESK_COMPONENT_TYPE,
    componentSubType: '',
    isTemplate: false,
    singleton: true,
    payload: next as unknown as Record<string, unknown>,
    createdBy: existing?.createdBy ?? LOGGED_IN_USER_ID,
    updatedBy: LOGGED_IN_USER_ID,
    creationTime: existing?.creationTime ?? now,
    updatedTime: now,
  });
}

export async function setDeskContext(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as { mandate?: string; benchmark?: string };
  if (a.mandate === undefined && a.benchmark === undefined) {
    return { ok: false, summary: 'Nothing to set — pass mandate and/or benchmark. Use add_limit for limits.' };
  }
  const current = await readDeskContext(configManager);
  const next: DeskContext = {
    ...current,
    ...(a.mandate !== undefined ? { mandate: a.mandate } : {}),
    ...(a.benchmark !== undefined ? { benchmark: a.benchmark } : {}),
  };
  await writeDeskContext(configManager, next);
  return {
    ok: true,
    summary:
      `Desk context saved${next.mandate ? ` — mandate: ${next.mandate}` : ''}` +
      `${next.benchmark ? `; benchmark: ${next.benchmark}` : ''}. ` +
      'It is included in every future conversation, so it does not need repeating.',
    data: next,
  };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'limit';
}

export async function addLimit(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as Partial<DeskLimit> & { name?: string; metric?: string };
  if (!a.name) return { ok: false, summary: 'Missing required field: name — what to call this limit, e.g. "Single issuer cap".' };
  if (!a.metric) return { ok: false, summary: 'Missing required field: metric — the column being limited, e.g. "marketValue".' };
  if (a.max === undefined && a.min === undefined) {
    return { ok: false, summary: 'A limit needs max and/or min — otherwise there is nothing it can breach.' };
  }
  const aggregate = a.aggregate ?? 'sum';
  if (!AGG_FNS.includes(aggregate)) {
    return { ok: false, summary: `aggregate must be one of: ${AGG_FNS.join(', ')}.` };
  }
  const unit = a.unit ?? 'absolute';
  if (unit !== 'absolute' && unit !== 'percentOfTotal') {
    return { ok: false, summary: 'unit must be "absolute" or "percentOfTotal".' };
  }
  if (unit === 'percentOfTotal' && aggregate !== 'sum') {
    return {
      ok: false,
      summary: 'A percentOfTotal limit only makes sense on a sum — a share of a total is a sum divided by a sum.',
    };
  }

  const limit: DeskLimit = {
    id: slug(a.name),
    name: a.name,
    metric: a.metric,
    aggregate,
    groupBy: a.groupBy,
    unit,
    max: a.max,
    min: a.min,
    gridIds: a.gridIds,
  };
  const current = await readDeskContext(configManager);
  await writeDeskContext(configManager, {
    ...current,
    limits: [...current.limits.filter((l) => l.id !== limit.id), limit],
  });
  return {
    ok: true,
    summary: `Limit "${limit.name}" saved: ${describeLimit(limit)}. Check it with check_limits.`,
    data: limit,
  };
}

export async function removeLimit(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const name = args.name as string | undefined;
  if (!name) return { ok: false, summary: 'Missing required field: name.' };
  const current = await readDeskContext(configManager);
  const id = slug(name);
  const kept = current.limits.filter((l) => l.id !== id);
  if (kept.length === current.limits.length) {
    return {
      ok: false,
      summary: current.limits.length
        ? `No limit called "${name}". Current: ${current.limits.map((l) => l.name).join(', ')}.`
        : 'No limits are set.',
    };
  }
  await writeDeskContext(configManager, { ...current, limits: kept });
  return { ok: true, summary: `Removed limit "${name}".` };
}

function describeLimit(l: DeskLimit): string {
  const scope = l.groupBy ? `per ${l.groupBy}` : 'across the book';
  const unit = l.unit === 'percentOfTotal' ? '% of total' : '';
  const bounds = [
    l.max !== undefined ? `max ${l.max}${unit}` : '',
    l.min !== undefined ? `min ${l.min}${unit}` : '',
  ].filter(Boolean).join(', ');
  return `${l.aggregate}(${l.metric}) ${scope}, ${bounds}`;
}

interface Breach {
  limit: string;
  group: string | null;
  value: number;
  bound: number;
  side: 'over' | 'under';
  /** Signed distance from the bound, in the limit's own unit. */
  by: number;
}

/**
 * Evaluate every limit against live rows.
 *
 * Each limit runs through `runQuery`, the same engine behind every other number
 * the assistant reports, so a breach is computed rather than judged. A limit
 * whose column cannot be resolved is reported as unevaluated — never quietly
 * treated as passing, which would be the worst possible failure here.
 */
export interface LimitVerdict {
  breaches: Breach[];
  passed: string[];
  unevaluated: string[];
  skippedBooks: Set<string>;
}

/**
 * Rows and catalogues for one limit. Injected rather than gathered inline so a
 * simulation can evaluate the SAME limits against hypothetical rows without a
 * second copy of the evaluation rules — the "what if" answer and the real one
 * are then computed identically by construction.
 */
export type LimitRowSource = (
  limit: DeskLimit,
) => Promise<{ ok: true; rows: Array<Record<string, unknown>>; catalogues: Array<{ name: string; catalogue: CatalogColumn[] }>; skipped: Array<{ displayName: string; reason: string }> } | { ok: false; error: string }>;

export async function evaluateLimits(limits: readonly DeskLimit[], source: LimitRowSource): Promise<LimitVerdict> {
  const breaches: Breach[] = [];
  const passed: string[] = [];
  const unevaluated: string[] = [];
  const skippedBooks = new Set<string>();

  for (const limit of limits) {
    const got = await source(limit);
    if (!got.ok) {
      unevaluated.push(`${limit.name} — ${got.error}`);
      continue;
    }
    const gathered = { rows: got.rows, catalogues: got.catalogues };
    for (const s of got.skipped) skippedBooks.add(`${s.displayName} (${s.reason})`);
    if (gathered.rows.length === 0) {
      unevaluated.push(`${limit.name} — no rows could be read`);
      continue;
    }

    const metric = resolveAcross(limit.metric, gathered.catalogues);
    if (!metric.ok) {
      unevaluated.push(`${limit.name} — ${metric.error}`);
      continue;
    }
    let groupCol: string | undefined;
    if (limit.groupBy) {
      const g = resolveAcross(limit.groupBy, gathered.catalogues);
      if (!g.ok) {
        unevaluated.push(`${limit.name} — ${g.error}`);
        continue;
      }
      groupCol = g.colId;
    }

    // The denominator for a share limit is the same aggregate over everything.
    let total = 0;
    if (limit.unit === 'percentOfTotal') {
      const whole = runQuery(gathered.rows, {
        groupBy: [SOURCE_COLUMN],
        aggregate: [{ column: metric.colId, fn: 'sum', as: 'v' }],
      });
      if (!whole.ok) {
        unevaluated.push(`${limit.name} — ${whole.error}`);
        continue;
      }
      total = whole.value.rows.reduce((s, r) => s + (typeof r.v === 'number' ? r.v : 0), 0);
      if (total === 0) {
        unevaluated.push(`${limit.name} — the total is zero, so a share of it is undefined`);
        continue;
      }
    }

    const outcome = runQuery(gathered.rows, {
      groupBy: groupCol ? [groupCol] : [SOURCE_COLUMN],
      aggregate: [{ column: metric.colId, fn: limit.aggregate, as: 'v' }],
      limit: 500,
    });
    if (!outcome.ok) {
      unevaluated.push(`${limit.name} — ${outcome.error}`);
      continue;
    }

    // Without a groupBy the limit is about the book as a whole, so the
    // per-blotter rows are summed back into one number rather than each book
    // being tested against a portfolio-wide bound.
    const measured: Array<{ group: string | null; value: number }> = groupCol
      ? outcome.value.rows.map((r) => ({ group: String(r[groupCol] ?? '(blank)'), value: Number(r.v ?? 0) }))
      : [{ group: null, value: outcome.value.rows.reduce((s, r) => s + Number(r.v ?? 0), 0) }];

    let breached = false;
    for (const m of measured) {
      const value = limit.unit === 'percentOfTotal' ? (m.value / total) * 100 : m.value;
      const rounded = Math.round(value * 10000) / 10000;
      if (limit.max !== undefined && rounded > limit.max) {
        breaches.push({ limit: limit.name, group: m.group, value: rounded, bound: limit.max, side: 'over', by: Math.round((rounded - limit.max) * 10000) / 10000 });
        breached = true;
      } else if (limit.min !== undefined && rounded < limit.min) {
        breaches.push({ limit: limit.name, group: m.group, value: rounded, bound: limit.min, side: 'under', by: Math.round((limit.min - rounded) * 10000) / 10000 });
        breached = true;
      }
    }
    if (!breached) passed.push(limit.name);
  }

  // Biggest breach first — the point of the answer is what to look at.
  breaches.sort((a, b) => b.by - a.by);
  return { breaches, passed, unevaluated, skippedBooks };
}

/** The live row source: what a limit is actually measured against. */
export function liveLimitRows(deps: PortfolioDeps): LimitRowSource {
  return async (limit) => {
    const resolvedEntries = await blotterEntries(limit.gridIds);
    if (!resolvedEntries.ok) return { ok: false as const, error: resolvedEntries.error };
    const gathered = await gatherRows(deps, resolvedEntries.entries, false);
    return { ok: true as const, rows: gathered.rows, catalogues: gathered.catalogues, skipped: gathered.skipped };
  };
}

export async function checkLimits(
  deps: PortfolioDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const context = await readDeskContext(deps.configManager);
  if (context.limits.length === 0) {
    return { ok: true, summary: 'No limits are set. Add one with add_limit, e.g. a 5% single-issuer cap.', data: { breaches: [] } };
  }
  const only = args.name as string | undefined;
  const limits = only ? context.limits.filter((l) => l.id === slug(only)) : context.limits;
  if (limits.length === 0) {
    return { ok: false, summary: `No limit called "${only}". Current: ${context.limits.map((l) => l.name).join(', ')}.` };
  }

  const { breaches, passed, unevaluated, skippedBooks } = await evaluateLimits(limits, liveLimitRows(deps));

  const unit = (name: string) => (limits.find((l) => l.name === name)?.unit === 'percentOfTotal' ? '%' : '');
  const lines = breaches.map(
    (b) =>
      `${b.limit}${b.group ? ` — ${b.group}` : ''}: ${b.value}${unit(b.limit)} vs ${b.side === 'over' ? 'max' : 'min'} ` +
      `${b.bound}${unit(b.limit)} (${b.side} by ${b.by}${unit(b.limit)})`,
  );

  return {
    ok: true,
    summary:
      (breaches.length
        ? `${breaches.length} breach(es): ${lines.join('; ')}.`
        : `All ${passed.length} limit(s) within bounds.`) +
      (passed.length && breaches.length ? ` Within bounds: ${passed.join(', ')}.` : '') +
      // An unevaluated limit must never read as a passing one.
      (unevaluated.length ? ` NOT EVALUATED (treat as unknown, not as passing): ${unevaluated.join('; ')}.` : '') +
      (skippedBooks.size ? ` Blotters that could not be read: ${[...skippedBooks].join('; ')}.` : ''),
    data: { breaches, passed, unevaluated },
  };
}

export async function listLimits(configManager: ConfigManager): Promise<ToolExecutionResult> {
  const context = await readDeskContext(configManager);
  if (context.limits.length === 0) {
    return { ok: true, summary: 'No limits are set.', data: [] };
  }
  return {
    ok: true,
    summary: context.limits.map((l) => `"${l.name}" — ${describeLimit(l)}`).join('; '),
    data: context.limits,
  };
}
