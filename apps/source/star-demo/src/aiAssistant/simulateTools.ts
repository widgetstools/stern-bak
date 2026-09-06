/**
 * "What if…" — a pre-trade check against the desk's own limits.
 *
 * The question behind it is "can I do this?", asked before the trade rather
 * than discovered after it: add 50mm of ACME, mark a sector down 10%, and see
 * which limits move and which break.
 *
 * The hypothetical rows never touch the grid, the feed or any config row. This
 * builds an adjusted COPY in memory, evaluates the same limits against it, and
 * reports the difference. Nothing is written, so there is nothing to undo — and
 * the tool description says so, because a model that believed it had staged a
 * trade would be dangerous in a way none of the other tools are.
 *
 * Correctness rests on evaluating the real and hypothetical states through one
 * code path: `evaluateLimits` takes its rows from an injected source, so the
 * "before" and "after" numbers are computed identically by construction rather
 * than by two implementations that have to be kept in agreement.
 */
import { getValueByPath } from '@wellsfargo-starui/types';
import { runQuery, type FilterOp, FILTER_OPS } from '@wellsfargo-starui/data';
import { blotterEntries, gatherRows, resolveAcross, type PortfolioDeps } from './portfolioTools';
import {
  evaluateLimits,
  liveLimitRows,
  readDeskContext,
  type LimitVerdict,
} from './deskTools';
import type { CatalogColumn } from './columnResolver';
import type { ToolExecutionResult } from './toolResult';

interface Adjustment {
  column: string;
  /** Exactly one of these three. */
  changeBy?: number;
  changePercent?: number;
  setTo?: number;
  /** Restrict the adjustment to rows matching these clauses. */
  where?: Array<{ column: string; op: FilterOp; value?: unknown }>;
}

/** A row matches when every clause holds. Reuses the query engine's operators. */
function matchesAll(
  row: Record<string, unknown>,
  where: Adjustment['where'],
  resolve: (name: string) => string | undefined,
): boolean {
  if (!where?.length) return true;
  for (const clause of where) {
    const col = resolve(clause.column);
    if (!col) return false;
    // One-row runQuery keeps operator semantics identical to every other filter
    // in the system rather than reimplementing twelve comparisons here.
    const outcome = runQuery([row], { filter: [{ column: col, op: clause.op, value: clause.value }] });
    if (!outcome.ok || outcome.value.matched === 0) return false;
  }
  return true;
}

export async function simulateChange(
  deps: PortfolioDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as { adjustments?: Adjustment[]; addRows?: Array<Record<string, unknown>>; gridIds?: string[] };
  const adjustments = a.adjustments ?? [];
  const addRows = a.addRows ?? [];
  if (adjustments.length === 0 && addRows.length === 0) {
    return {
      ok: false,
      summary: 'Nothing to simulate — pass adjustments (change an existing column) and/or addRows (hypothetical new positions).',
    };
  }

  for (const adj of adjustments) {
    if (!adj?.column) return { ok: false, summary: 'Each adjustment needs a column.' };
    const given = [adj.changeBy, adj.changePercent, adj.setTo].filter((v) => v !== undefined);
    if (given.length !== 1) {
      return { ok: false, summary: `Adjustment on "${adj.column}" needs exactly one of changeBy, changePercent or setTo.` };
    }
    for (const clause of adj.where ?? []) {
      if (!clause?.column) return { ok: false, summary: 'Each where clause needs a column.' };
      if (!(FILTER_OPS as readonly string[]).includes(clause.op)) {
        return { ok: false, summary: `Filter op "${clause.op}" is not one of: ${FILTER_OPS.join(', ')}.` };
      }
    }
  }

  const resolvedEntries = await blotterEntries(a.gridIds);
  if (!resolvedEntries.ok) return { ok: false, summary: resolvedEntries.error };
  const gathered = await gatherRows(deps, resolvedEntries.entries, false);
  if (gathered.rows.length === 0 && addRows.length === 0) {
    return {
      ok: false,
      summary:
        'No rows could be read, so there is nothing to simulate against: ' +
        gathered.skipped.map((s) => `${s.displayName} — ${s.reason}`).join('; '),
    };
  }

  const catalogues: Array<{ name: string; catalogue: CatalogColumn[] }> = gathered.catalogues;
  const resolve = (name: string): string | undefined => {
    const r = resolveAcross(name, catalogues);
    return r.ok ? r.colId : undefined;
  };

  // Resolve every column the request names before touching a row, so a typo is
  // a refusal rather than an adjustment that silently applies to nothing.
  const resolvedAdjustments: Array<Adjustment & { colId: string }> = [];
  for (const adj of adjustments) {
    const colId = resolve(adj.column);
    if (!colId) {
      const r = resolveAcross(adj.column, catalogues);
      return { ok: false, summary: r.ok ? `Could not resolve "${adj.column}".` : r.error };
    }
    resolvedAdjustments.push({ ...adj, colId });
  }

  let touched = 0;
  const adjusted = gathered.rows.map((row) => {
    let next = row;
    for (const adj of resolvedAdjustments) {
      if (!matchesAll(row, adj.where, resolve)) continue;
      const current = getValueByPath(row, adj.colId);
      if (typeof current !== 'number') continue;
      const value =
        adj.setTo !== undefined
          ? adj.setTo
          : adj.changeBy !== undefined
            ? current + adj.changeBy
            : current * (1 + (adj.changePercent ?? 0) / 100);
      // Written as a flat key: a dotted colId set flat is what `getValueByPath`
      // reads first, so the adjusted value wins over the original nested one
      // without mutating the source row's shape.
      next = { ...next, [adj.colId]: value };
      touched += 1;
    }
    return next;
  });

  const hypothetical = [...adjusted, ...addRows];

  const context = await readDeskContext(deps.configManager);
  if (context.limits.length === 0) {
    return {
      ok: true,
      summary:
        `Simulated: ${touched} row adjustment(s)${addRows.length ? ` and ${addRows.length} added row(s)` : ''}. ` +
        'No limits are set, so there is nothing to check it against — add one with add_limit. Nothing was written.',
      data: { touched, added: addRows.length, breaches: [] },
    };
  }

  const before = await evaluateLimits(context.limits, liveLimitRows(deps));
  const after = await evaluateLimits(context.limits, async () => ({
    ok: true as const,
    rows: hypothetical,
    catalogues,
    skipped: gathered.skipped,
  }));

  const key = (b: { limit: string; group: string | null }) => `${b.limit}::${b.group ?? ''}`;
  const wasBreaching = new Set(before.breaches.map(key));
  const nowBreaching = new Set(after.breaches.map(key));
  const newBreaches = after.breaches.filter((b) => !wasBreaching.has(key(b)));
  const resolvedBreaches = before.breaches.filter((b) => !nowBreaching.has(key(b)));

  const describe = (b: { limit: string; group: string | null; value: number; bound: number; side: string }) =>
    `${b.limit}${b.group ? ` — ${b.group}` : ''}: ${b.value} vs ${b.side === 'over' ? 'max' : 'min'} ${b.bound}`;

  const verdict = newBreaches.length
    ? `WOULD BREACH ${newBreaches.length}: ${newBreaches.map(describe).join('; ')}.`
    : 'No new breaches.';

  return {
    ok: true,
    summary:
      `Hypothetical only — nothing was written. ${touched} row adjustment(s)` +
      `${addRows.length ? `, ${addRows.length} added row(s)` : ''}. ${verdict}` +
      (resolvedBreaches.length ? ` Would CLEAR: ${resolvedBreaches.map(describe).join('; ')}.` : '') +
      (before.breaches.length ? ` Already breaching before this: ${before.breaches.map(describe).join('; ')}.` : '') +
      (after.unevaluated.length
        ? ` NOT EVALUATED (treat as unknown, not as passing): ${after.unevaluated.join('; ')}.`
        : ''),
    data: {
      touched,
      added: addRows.length,
      newBreaches,
      resolvedBreaches,
      before: summarise(before),
      after: summarise(after),
    },
  };
}

function summarise(v: LimitVerdict) {
  return { breaches: v.breaches, passed: v.passed, unevaluated: v.unevaluated };
}
