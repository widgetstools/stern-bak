/**
 * The morning brief — one call that answers "what do I need to know?".
 *
 * Pure composition: nothing here computes anything of its own. It runs the
 * pieces a person would otherwise ask for one at a time — what's on each book,
 * what moved since the mark, what's breaching — and returns them as one
 * structured result for the model to read out.
 *
 * Composition is the point rather than a shortcut. Each part already refuses
 * honestly when it cannot answer (no baseline, unreadable blotter, unevaluatable
 * limit), and those refusals are carried through verbatim instead of being
 * flattened into a cheerful summary. A brief that quietly omits the book it
 * couldn't read is worse than no brief.
 */
import { summariseRows } from '@wellsfargo-starui/data';
import { gatherRows, blotterEntries, type PortfolioDeps } from './portfolioTools';
import { checkLimits, readDeskContext } from './deskTools';
import { compareToBaseline, listBaselineNames } from './baselineTools';
import { gridScopeId } from './gridProfiles';
import type { ToolExecutionResult } from './toolResult';

interface BookLine {
  blotter: string;
  configId: string;
  rows: number;
  headlines: string[];
  movers?: string;
  baseline?: string;
}

export async function morningBrief(
  deps: PortfolioDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as { gridIds?: string[]; baselineName?: string; topMovers?: number };

  const resolved = await blotterEntries(a.gridIds);
  if (!resolved.ok) return { ok: false, summary: resolved.error };
  const entries = resolved.entries;

  const books: BookLine[] = [];
  const unreadable: string[] = [];

  for (const entry of entries) {
    const gathered = await gatherRows(deps, [entry], false);
    if (gathered.skipped.length) {
      unreadable.push(`${entry.displayName} — ${gathered.skipped[0].reason}`);
      continue;
    }
    const line: BookLine = {
      blotter: entry.displayName,
      configId: entry.configId,
      rows: gathered.rows.length,
      headlines: [],
    };

    if (gathered.rows.length > 0) {
      // The same digest `summarize_grid_data` produces — its highlights are
      // already written as plain sentences meant to be quoted.
      const digest = summariseRows(gathered.rows, {});
      line.headlines = digest.highlights.slice(0, 3);
    }

    // Movers only where a mark actually exists. No baseline is a normal state,
    // not a failure — say nothing rather than implying nothing moved.
    const instanceId = gridScopeId(entry);
    const names = await listBaselineNames(deps.configManager, instanceId);
    const wanted = a.baselineName && names.includes(a.baselineName) ? a.baselineName : names[0];
    if (wanted) {
      line.baseline = wanted;
      const diff = await compareToBaseline(deps, {
        targetGridId: entry.configId,
        name: wanted,
        limit: Math.min(a.topMovers ?? 5, 50),
      });
      line.movers = diff.summary;
    }
    books.push(line);
  }

  const limits = await checkLimits(deps, {});
  const context = await readDeskContext(deps.configManager);

  const parts: string[] = [];
  if (context.mandate) parts.push(`Mandate: ${context.mandate}.`);
  for (const b of books) {
    parts.push(
      `${b.blotter}: ${b.rows} rows.` +
        (b.headlines.length ? ` ${b.headlines.join(' ')}` : '') +
        (b.movers ? ` Since "${b.baseline}": ${b.movers}` : ' No baseline captured, so no movers — offer to mark one.'),
    );
  }
  parts.push(`Limits: ${limits.summary}`);
  if (unreadable.length) {
    parts.push(`NOT covered by this brief: ${unreadable.join('; ')}.`);
  }
  if (books.length === 0) {
    return {
      ok: false,
      summary:
        'None of the blotters could be read, so there is nothing to brief on: ' + unreadable.join('; '),
    };
  }

  return {
    ok: true,
    summary: parts.join(' '),
    data: { books, limits: limits.data, unreadable, mandate: context.mandate, benchmark: context.benchmark },
  };
}
